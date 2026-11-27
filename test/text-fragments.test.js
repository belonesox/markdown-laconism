const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localFragment, findFragment, editorLinks } = require('../text-fragments');
const { textOptions, selectText } = require('../text-include');

test('local text directives preserve URL delimiters and reject external links', () => {
    assert.deepEqual(localFragment('../a%20b.py#:~:text=a%2Cb'), { src: '../a%20b.py', directive: 'a%2Cb' });
    for (const href of ['https://host/f#:~:text=x', '//host/f#:~:text=x', 'f#section', '#:~:text=x']) {
        assert.equal(localFragment(href), undefined);
    }
    for (const raw of ['a,b,c', 'a&text=b', '%ZZ', '']) assert.throws(() => findFragment('abc', raw));
});

test('matches original UTF-16 offsets through whitespace, punctuation and encoded commas', () => {
    const text = '😀 foobar foo(а, Б)\r\n\tprice + tax & fees';
    const match = findFragment(text, 'foo%28А%2C%20б%29,price%20%2B%20tax%20%26%20fees');
    assert.equal(text.slice(match.start, match.end), 'foo(а, Б)\r\n\tprice + tax & fees');
    assert.equal(findFragment(text, 'Б%29%20price').end, text.indexOf(' +'));
});

test('context distinguishes repeated words and can complete a word', () => {
    const text = 'old name end! new name end! handbook';
    assert.equal(findFragment(text, 'name,end').ambiguous, true);
    assert.equal(findFragment(text, 'new-,name,end,-!').start, text.lastIndexOf('name'));
    assert.equal(findFragment(text, 'hand-,book').start, text.indexOf('book'));
    assert.throws(() => findFragment(text, 'nam,end'), /not found/i);
    assert.throws(() => findFragment(text, 'name,nd'), /not found/i);
});

test('prefix-only and suffix-only context select the adjacent occurrence without quoting the context', () => {
    const text = 'bar fooz foo\tbar baz foo barge';
    for (const [directive, word, start] of [
        ['foo-,bar', 'bar', text.indexOf('bar baz')],
        ['foo,-bar', 'foo', text.indexOf('foo\t')],
    ]) {
        const match = findFragment(text, directive);
        assert.deepEqual(match, { start, end: start + word.length, ambiguous: false });
        assert.equal(text.slice(match.start, match.end), word);
    }
    assert.throws(() => findFragment(text, 'foo-,-bar'), /Missing start term/);
});

test('editor links cover the label and destination of links and includes, skipping literal examples', () => {
    const url = '../logic/a.py#:~:text=test';
    const link = '[method](' + url + ')';
    const md = [link, '![](' + url + ')', '`' + link + '`', '```md', link, '```'].join('\n\n');
    const links = editorLinks(md);
    assert.deepEqual(links.map(l => md.slice(l.from, l.to)), ['method', url, '![]', url]);
    assert.deepEqual(links.map(l => l.href), [url, url, url, url]);
});

test('source link visibility and line selections on a matched excerpt', () => {
    const text = 'outside\r\nstart\r\n😀middle\r\nend\r\noutside';
    const match = findFragment(text, 'start,end');
    const opts = textOptions('a.py', 'source_link=0, rows=1, cols=1:');
    assert.equal(opts.sourceLink, false);
    assert.equal(selectText(() => [text.slice(match.start, match.end)], opts), 'middle\r\n');
    assert.equal(textOptions('a.py', '').sourceLink, true);
    assert.throws(() => textOptions('a.py', 'source_link=no'));
});
