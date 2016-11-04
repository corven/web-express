module.exports = {
    cookieSecret: 'здесь находится мой секрет куки файла',
    gmail: {
        user: 'Мое имя',
        password: '123'
    },
    mongo: {
        development: {
            connectionString: 'mongodb://usr1:usr1@ds029436.mlab.com:29436/firstdb'
        },
        production: {
            connectionString: 'mongodb://usr1:usr1@ds029436.mlab.com:29436/firstdb'
        }
    }
};
