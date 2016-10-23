suite('Тесты страницы "О"', function () {
    test('Должна содержать ссылку на страницу контактов', function () {
        assert($('a[href="/contact"]'));
    })
});
