var cluster = require('cluster');

function startWorker() {
    var worker = cluster.fork();
    console.log('Кластер: Исполнитель %d запущен', worker.id);
}

if (cluster.isMaster){
    require('os').cpus().forEach(function(){
	    startWorker();
    });

    // записываем в журнал всех отключившихся исполнителей.
    // Если исполнитель отключается, он должен затем завершить работу, так что мы подождем события
    // завершения работы для поождения нового исполнителя ему на замену
    cluster.on('disconnect', function(worker){
        console.log('Кластер: Исполнитель %d отключился от кластера.', worker.id);
    });

    // когда исполнитель завершает работу, создаем исполнителя ему на замену
    cluster.on('exit', function(worker, code, signal){
        console.log('Кластер: Исполнитель %d завершил работу с кодом завершения %d (%s),', worker.id, code, signal);
        startWorker();
    });

} else {
    // запускаем наше приложение на исполнителе
    require('./meadowlark.js')();
}












//    "session-mongoose": "^0.4.1",
//    "vhost": "^2.0.0"