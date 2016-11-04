var express = require('express');
var app = express();
var http = require('http');
var fs = require('fs');
// var jqupload = require('jquery-file-upload-middleware');

var formidable = require('formidable');
var fortune = require('./lib/fortune');
var credentials = require('./credentials');
// var cartValidation = require('./lib/cartValidation.js');
// var emailService = require('./lib/email.js');
var server;
var Vacation = require('./models/vacation');
var VacationInSeasonListener = require('./models/vacationInSeasonListener.js');
var MongoSessionStore = require('session-mongoose')(require('connect'));
var sessionStore = new MongoSessionStore({ url: credentials.mongo[app.get('env')].connectionString });

// var VALID_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

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

// подключение session
app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')({
    resave: false,
    saveUninitialized: false,
    secret: credentials.cookieSecret,
    store: sessionStore
}));

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
app.use(express.static(__dirname + '/public'));
app.use(require('body-parser').urlencoded({extended: true}));

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

app.get('/vacations', function(req, res){
    Vacation.find({ available: true }, function(err, vacations){
        var currency = req.session.currency || 'USD';
        var context = {
            currency: currency,
            vacations: vacations.map(function(vacation){
                return {
                    sku: vacation.sku,
                    name: vacation.name,
                    description: vacation.description,
                    inSeason: vacation.inSeason,
                    price: convertFromUSD(vacation.priceInCents / 100, currency),
                    qty: vacation.qty
                };
            })
        };
        switch(currency){
            case 'USD': context.currencyUSD = 'selected'; break;
            case 'GBP': context.currencyGBP = 'selected'; break;
            case 'BTC': context.currencyBTC = 'selected'; break;
        }
        res.render('vacations', context);
    });
});

function convertFromUSD(value, currency){
    switch(currency){
        case 'USD': return value * 1;
        case 'GBP': return value * 0.6;
        case 'BTC': return value * 0.0023707918444761;
        default: return NaN;
    }
}

app.get('/notify-me-when-in-season', function(req, res){
    res.render('notify-me-when-in-season', { sku: req.query.sku });
});

app.post('/notify-me-when-in-season', function(req, res){
    VacationInSeasonListener.update(
        { email: req.body.email },
        { $push: { skus: req.body.sku } },
        { upsert: true },
        function(err){
            if(err) {
                console.error(err.stack);
                req.session.flash = {
                    type: 'danger',
                    intro: 'Упс!',
                    message: 'При обработке вашего запроса произошла ошибка.'
                };
                return res.redirect(303, '/vacations');
            }
            req.session.flash = {
                type: 'success',
                intro: 'Спасибо!',
                message: 'Вы будете оповещены когда наступит сезон для этого тура.'
            };
            return res.redirect(303, '/vacations');
        }
    );
});

app.get('/set-currency/:currency', function(req,res){
    req.session.currency = req.params.currency;
    return res.redirect(303, '/vacations');
});

app.use(function (req, res, next) {
    res.locals.showTests = app.get('env') != 'production' && req.query.test === '1';
    next();
});

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

app.use(function (req, res, next) {
    var cluster = require('cluster');
    if (cluster.isWorker) {
        console.log('Исполнитель %d получил запрос', cluster.worker.id);
    }
    next();
});

// middleware to add weather data to context
app.use(function(req, res, next){
    if(!res.locals.partials) res.locals.partials = {};
    res.locals.partials.weatherContext = getWeatherData();
    next();
});

app.use(function (req, res, next) {
    //если имеется экстренное сообщение, переместим его в контекст а затем удалим
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next();
});

// app.use('/upload', function (req, res, next) {
//     var now = Date.now();
//     jqupload.fileHandler({
//         uploadDir: function () {
//             return __dirname + '/public/uploads/' + now;
//         },
//         uploadUrl: function () {
//             return '/uploads/' + now;
//         }
//     })(req, res, next);
// });

app.get('/', function (req, res) {
    res.render('home');
});

app.get('/about', function (req, res) {
    res.render('about', {fortune: fortune.getFortune(), pageTestScript: '/qa/tests-about.js'});

});

app.get('/tours/hood-river', function(req, res){
    res.render('tours/hood-river');
});

app.get('/tours/oregon-coast', function(req, res){
    res.render('tours/oregon-coast');
});

app.get('/tours/request-group-rate', function(req, res){
    res.render('tours/request-group-rate');
});

app.get('/nursery-rhyme', function(req, res){
    res.render('nursery-rhyme');
});
app.get('/data/nursery-rhyme', function(req, res){
    res.json({
        animal: 'бельчонок',
        bodyPart: 'хвост',
        adjective: 'пушистый',
        noun: 'черт'
    });
});

app.get('/thank-you', function(req, res){
    res.render('thank-you');
});

app.get('/newsletter', function(req, res){
    res.render('newsletter');
});

// for now, we're mocking NewsletterSignup:
function NewsletterSignup(){
}
NewsletterSignup.prototype.save = function(cb){
    cb();
};

var VALID_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

app.post('/newsletter', function(req, res){
    var name = req.body.name || '', email = req.body.email || '';
    // проверка вводимых данных
    if (!email.match(VALID_EMAIL_REGEX)) {
        if (req.xhr) {
            return res.json({ error: 'Некорректный адрес.' });
        }
        req.session.flash = {
            type: 'danger',
            intro: 'Ошибка проверки!',
            message: 'Введенный мами Email некорректен.'
        };

        return res.redirect(303, '/newsletter/archive');
    }

    new NewsletterSignup({ name: name, email: email }).save(function(err){
        if (err) {
            if (req.xhr) {
                return res.json({ error: 'Database error.' });
            }
            req.session.flash = {
                type: 'danger',
                intro: 'Database error!',
                message: 'There was a database error; please try again later.'
            };

            return res.redirect(303, '/newsletter/archive');
        }
        if (req.xhr) {
            return res.json({ success: true });
        }
        req.session.flash = {
            type: 'success',
            intro: 'Thank you!',
            message: 'You have now been signed up for the newsletter.'
        };
        return res.redirect(303, '/newsletter/archive');
    });
});
app.get('/newsletter/archive', function(req, res){
    res.render('newsletter/archive');
});

app.post('/process', function(req, res){
    if(req.xhr || req.accepts('json,html')==='json'){
        //если здесь есть ошибка то мы должны отправить {error: описание ошибки}
        res.send({success: true});
    } else {
        //если бы возникла ошибка нам нужно бы перенаправлять на страницу ошибки
        res.redirect(303, '/thank-you');
    }
});

app.get('/contest/vacation-photo', function(req, res){
    var now = new Date();
    res.render('contest/vacation-photo', {year: now.getFullYear(), month: now.getMonth()});
});

var dataDir = __dirname + '/data';
var vacationPhotoDir = dataDir + '/vacation-photo';
if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if(!fs.existsSync(vacationPhotoDir)) fs.mkdirSync(vacationPhotoDir);

function saveContestEntry(contestName, email, year, month, photoPath){
    // TODO...позже
}

app.post('/contest/vacation-photo/:year/:month', function(req, res){
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files){
        if (err) {
            req.session.flash = {
                type: 'danger',
                intro: 'Oops!',
                message: 'Во время обработки отправленной вами форы произошла ошибка. Пожалуйста попробуйте еще раз'
            };
            return res.redirect(303, '/contest/vacation-photo');
        }
        var photo = files.photo;
        var dir = vacationPhotoDir + '/' + Date.now();
        var path = dir + '/' + photo.name;
        // fs.mkdirSync(dir);
        // fs.renameSync(photo.path, path);
        saveContestEntry('vacation-photo', fields.email, req.params.year, req.params.month, path);
        req.session.flash = {
            type: 'success',
            intro: 'Удачи!',
            message: 'Вы стали участником конкурса.'
        };
        return res.redirect(303, '/contest/vacation-photo/entries');
    });
});

app.get('/contest/vacation-photo/entries', function(req, res){
    res.render('contest/vacation-photo/entries');
});

// app.use(cartValidation.checkWaivers);
// app.use(cartValidation.checkGuestCounts);
//
// app.post('/cart/checkout', function(req, res){
//     var cart = req.session.cart;
//     if (!cart) {
//         next(new Error('Корзина не существует.'));
//     }
//     var name = req.body.name || '', email = req.body.email || '';
//     // Проверка вводимых данных
//     if(!email.match(VALID_EMAIL_REGEX)) {
//         return res.next(new Error('Некорректный адрес электронной почты.'));
//     }
//     // присваиваем случайный идентификатор корзины. ПРи обычных условиях использовать идентификатор БД
//     cart.number = Math.random().toString().replace(/^0\.0*/, '');
//     cart.billing = {
//         name: name,
//         email: email
//     };
//     res.render('email/cart-thank-you', {layout: null, cart: cart }, function(err,html){
//         if (err) {
//             console.log('Ошибка в шаблоне письма');
//         }
//         emailService.send(cart.billing.email, 'Спасибо за заказ поездки в Meadowlark Travel!', html);
//     });
//     res.render('cart-thank-you', { cart: cart });
// });

app.get('/epic-fail', function (req, res) {
    process.nextTick(function () {
        throw new Error('вах вах косячок');
    });
});

app.use(function (req, res) {
    res.status(404);
    res.render('404');
});

app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500);
    res.render('500');
});

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


