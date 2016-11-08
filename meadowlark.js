var http = require('http');
var express = require('express');
var fortune = require('./lib/fortune.js');
var formidable = require('formidable');
var fs = require('fs');
var vhost = require('vhost');
var Vacation = require('./models/vacation.js');
var VacationInSeasonListener = require('./models/vacationInSeasonListener.js');

var app = express();

var credentials = require('./credentials.js');

var emailService = require('./lib/email.js')(credentials);

var handlebars = require('express3-handlebars').create({
    defaultLayout:'main',
    helpers: {
        section: function(name, options){
            if(!this._sections) this._sections = {};
            this._sections[name] = options.fn(this);
            return null;
        }
    }
});

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', process.env.PORT || 3000);

// use domains for better error handling
app.use(function(req, res, next){
    // создание домена для этого запроса
    var domain = require('domain').create();
    // обрабатываем ошибки на этом домене
    domain.on('error', function(err){
        console.error('ПЕРЕХВАЧЕНА ОШИБКА ДОМЕНА\n', err.stack);
        try {
            // отказобезопасный останов через 5 сек
            setTimeout(function(){
                console.error('Оказобезопасный останов.');
                process.exit(1);
            }, 5000);

            // отключенеи от кластера
            var worker = require('cluster').worker;
            if(worker) worker.disconnect();

            //прекращение принятия новых запросов
            server.close();

            try {
                //попытка использовать маршрутизацию ошибок express
                next(err);
            } catch(error){
                // если маршрутизация ошибок express не сработала пробуем выдать текстовый ответ Node
                console.error('Express error mechanism failed.\n', error.stack);
                res.statusCode = 500;
                res.setHeader('content-type', 'text/plain');
                res.end('Server error.');
            }
        } catch(error){
            console.error('Unable to send 500 response.\n', error.stack);
        }
    });

    // добавляем обьекты запроса и ответа в домен
    domain.add(req);
    domain.add(res);

    // выполняем оставшуюся часть цепочки запроса в домене
    domain.run(next);
});

// Логирование
switch(app.get('env')){
    case 'development':
        //многоцветный вид
        app.use(require('morgan')('dev'));
        break;
    case 'production':
        //сохранение в файл
        app.use(require('express-logger')({ path: __dirname + '/log/requests.log'}));
        break;
}

var MongoSessionStore = require('session-mongoose')(require('connect'));
var sessionStore = new MongoSessionStore({ url: credentials.mongo[app.get('env')].connectionString });

app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')({
    resave: false,
    saveUninitialized: false,
    secret: credentials.cookieSecret,
    store: sessionStore
}));

app.use(express.static(__dirname + '/public'));
app.use(require('body-parser')());

// database configuration
var mongoose = require('mongoose');
var options = {
    server: {
        socketOptions: { keepAlive: 1 }
    }
};

switch (app.get('env')) {
    case 'development':
        mongoose.connect(credentials.mongo.development.connectionString, options);
        break;
    case 'production':
        mongoose.connect(credentials.mongo.production.connectionString, options);
        break;
    default:
        throw new Error('Неизвестная среда выполнения: ' + app.get('env'));
}

// initialize vacations
Vacation.find(function(err, vacations) {
    if (err) {
        return console.log(err);
    }

    if (vacations.length) {
        return;
    }

    new Vacation({
        name: 'Однодневный тур по реке Худ',
        slug: 'hood-river-day-trip',
        category: 'Однодневный тур',
        sku: 'HR199',
        description: 'Проведите день в плавании по реке КОлумбия и насладитесь сваренным по традиционным рецептам ' +
        'пивом на реке Худ',
        priceInCents: 9995,
        tags: ['однодневный тур', 'река худ', 'плавание', 'виндсерфинг', 'пивоварение'],
        inSeason: true,
        maximumGuests: 16,
        available: true,
        packagesSold: 0
    }).save();

    new Vacation({
        name: 'Отдых в Орегон Коуст',
        slug: 'oregon-coast-getaway',
        category: 'Отдых на выходных',
        sku: 'OC39',
        description: 'Enjoy the ocean air and quaint coastal towns!',
        priceInCents: 269995,
        tags: ['weekend getaway', 'oregon coast', 'beachcombing'],
        inSeason: false,
        maximumGuests: 8,
        available: true,
        packagesSold: 0
    }).save();

    new Vacation({
        name: 'Rock Climbing in Bend',
        slug: 'rock-climbing-in-bend',
        category: 'Adventure',
        sku: 'B99',
        description: 'Experience the thrill of rock climbing in the high desert.',
        priceInCents: 289995,
        tags: ['weekend getaway', 'bend', 'high desert', 'rock climbing', 'hiking', 'skiing'],
        inSeason: true,
        requiresWaiver: true,
        maximumGuests: 4,
        available: false,
        packagesSold: 0,
        notes: 'The tour guide is currently recovering from a skiing accident.'
    }).save();
});

// flash message middleware
app.use(function (req, res, next) {
    //если имеется экстренное сообщение, переместим его в контекст а затем удалим
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next();
});

// set 'showTests' context property if the querystring contains test=1
app.use(function (req, res, next) {
    res.locals.showTests = app.get('env') != 'production' && req.query.test === '1';
    next();
});

// mocked weather data
function getWeatherData() {
    return {
        locations: [
            {
                name: 'Portland',
                forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
                weather: 'Overcast',
                temp: '54.1 F (12.3 C)'
            },
            {
                name: 'Bend',
                forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
                weather: 'Partly Cloudy',
                temp: '55.0 F (12.8 C)'
            },
            {
                name: 'Manzanita',
                forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
                weather: 'Light Rain',
                temp: '55.0 F (12.8 C)'
            }
        ]
    };
}

// middleware to add weather data to context
app.use(function(req, res, next){
    if(!res.locals.partials) res.locals.partials = {};
    res.locals.partials.weatherContext = getWeatherData();
    next();
});

var admin = express.Router();
app.use(require('vhost')('admin.*', admin));

// create admin routes; these can be defined anywhere
admin.get('/', function(req, res){
    res.render('admin/home');
});
admin.get('/users', function(req, res){
    res.render('admin/users');
});


// add routes
require('./routes.js')(app);

// api

var Attraction = require('./models/attraction.js');

var rest = require('connect-rest');

rest.get('/attractions', function(req, content, cb) {
    Attraction.find({ approved: true }, function(err, attractions) {
        if(err) return cb({ error: 'Internal error.' });
        cb(null, attractions.map(function(a){
            return {
                name: a.name,
                description: a.description,
                location: a.location
            };
        }));
    });
});

rest.post('/attraction', function(req, content, cb) {
    var a = new Attraction({
        name: req.body.name,
        description: req.body.description,
        location: { lat: req.body.lat, lng: req.body.lng },
        history: {
            event: 'created',
            email: req.body.email,
            date: new Date()
        },
        approved: false
    });
    a.save(function(err, a){
        if (err) {
            return cb({ error: 'Unable to add attraction.' });
        }
        cb(null, { id: a._id });
    });
});

rest.get('/attraction/:id', function(req, content, cb){
    Attraction.findById(req.params.id, function(err, a){
        if (err) {
            return cb({ error: 'Unable to retrieve attraction.' });
        }
        cb(null, {
            name: a.name,
            description: a.description,
            location: a.location
        });
    });
});

// API configuration
var apiOptions = {
    context: '/',
    domain: require('domain').create()
};

apiOptions.domain.on('error', function(err){
    console.log('API domain error.\n', err.stack);
    setTimeout(function(){
        console.log('Server shutting down after API domain error.');
        process.exit(1);
    }, 5000);
    server.close();
    var worker = require('cluster').worker;
    if (worker) {
        worker.disconnect();
    }
});

// link API into pipeline
app.use(vhost('api.*', rest.rester(apiOptions)));

// add support for auto views
var autoViews = {};

app.use(function(req,res,next){
    var path = req.path.toLowerCase();
    // check cache; if it's there, render the view
    if (autoViews[path]) return res.render(autoViews[path]);
    // if it's not in the cache, see if there's
    // a .handlebars file that matches
    if (fs.existsSync(__dirname + '/views' + path + '.handlebars')) {
        autoViews[path] = path.replace(/^\//, '');
        return res.render(autoViews[path]);
    }
    // no view found; pass on to 404 handler
    next();
});


// 404 catch-all handler (middleware)
app.use(function(req, res, next){
    res.status(404);
    res.render('404');
});

// 500 error handler (middleware)
app.use(function(err, req, res, next){
    console.error(err.stack);
    res.status(500);
    res.render('500');
});

var server;

function startServer() {
    server = app.listen(app.get('port'), function () {
        console.log('Express запущен в режиме ' + app.get('env') + ' на http://localhost:' + app.get('port'));
    });
}

if (require.main === module) {
    //приложение запускается непосредственно
    startServer();
} else {
    //приложение портируется как модуль
    module.exports = startServer;
}
