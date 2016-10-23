var fortunes = [
    '1',
    '2',
    '3',
    '4'
];

exports.getFortune = function () {
    return fortunes[Math.floor(Math.random() * fortunes.length)];
};
