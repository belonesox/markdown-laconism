const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { commitWebUrl } = require('../commit-links');

function repository(t) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'laconism-commits-'));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('-c', 'user.name=Tester', '-c', 'user.email=test@example.org', 'commit', '--allow-empty', '-qm', 'initial');
    const hash = git('rev-parse', 'HEAD');
    const docs = path.join(cwd, 'docs');
    fs.mkdirSync(docs);
    return { git, hash, url: (override = '', cache = new Map()) => commitWebUrl(docs, hash.slice(0, 8), override, cache) };
}

test('looks past local origin, resolves short hashes, observes changes on next render', t => {
    const { git, hash, url } = repository(t);
    git('remote', 'add', 'origin', '/projects/mirror.git');
    git('remote', 'add', 'upstream', 'ssh://git@gitlab.example.org:2222/group/nested/repo.git');
    const render = new Map();
    const gitlab = 'https://gitlab.example.org/group/nested/repo/-/commit/' + hash;
    assert.equal(url('', render), gitlab);
    git('remote', 'set-url', 'origin', 'git@github.com:team/repo.git');
    assert.equal(url('', render), gitlab);
    assert.equal(url(), 'https://github.com/team/repo/commit/' + hash);
    assert.equal(url('https://custom.example.org/view?id={commit}'), 'https://custom.example.org/view?id=' + hash);
});

test('uses the fetch URL, drops credentials, preserves HTTPS ports and matches remote names', t => {
    const { git, hash, url } = repository(t);
    git('remote', 'add', 'gitlab', 'https://reader:example@git.acme.test:8443/team/project.git?token=example');
    git('remote', 'set-url', '--push', 'gitlab', 'git@github.com:team/other.git');
    assert.equal(url(), 'https://git.acme.test:8443/team/project/-/commit/' + hash);
});

test('unknown hosting can use an explicit template without a local repository or commit', () => {
    const render = template => commitWebUrl(undefined, 'ab12cd34', template, new Map());
    assert.equal(render('https://example.org/commits/{commit}'), 'https://example.org/commits/ab12cd34');
    for (const template of ['', 'https://example.org/static', 'invalid/{commit}', 'file:///{commit}', 'https://user:secret@git.test/{commit}']) {
        assert.equal(render(template), undefined);
    }
});
