const { execFileSync } = require('child_process');

// Read local metadata only. Credentials from remote URLs must never reach HTML.
function git(cwd, args) {
    if (!cwd) return '';
    try {
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd();
    } catch {
        return '';
    }
}

function remoteTemplate(name, address) {
    if (!address.includes('://')) {
        const scp = /^(?:[^@/\s]+@)?([\w.-]+):([^\\].*)$/.exec(address);
        if (!scp || scp[1].length === 1) return;
        address = 'ssh://' + scp[1] + '/' + scp[2].replace(/^\/+/, '');
    }
    let url;
    try { url = new URL(address); } catch { return; }
    if (!['ssh:', 'git:', 'https:', 'http:'].includes(url.protocol)) return;
    let host = url.hostname.toLowerCase();
    if (url.protocol === 'ssh:' && host === 'ssh.github.com') host = 'github.com';
    if (url.protocol === 'ssh:' && host === 'altssh.gitlab.com') host = 'gitlab.com';
    const service = /git(hub|lab)/i.exec(host) || /git(hub|lab)/i.exec(name);
    const repo = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '');
    if (!service || !repo || repo === '/') return;
    const port = /^https?:$/.test(url.protocol) && url.port ? ':' + url.port : '';
    const route = service[1].toLowerCase() === 'lab' ? '/-/commit/' : '/commit/';
    return 'https://' + host + port + repo + route + '{commit}';
}

function repositoryTemplate(cwd) {
    const remotes = git(cwd, ['remote', '-v']).split('\n')
        .map(line => /^(\S+)\s+(.+?)\s+\(fetch\)/.exec(line)).filter(Boolean);
    remotes.sort((a, b) => Number(b[1] === 'origin') - Number(a[1] === 'origin'));
    for (const [, name, address] of remotes) {
        const template = remoteTemplate(name, address);
        if (template) return template;
    }
}

// Cache within one render so repeated references share git lookups; the next
// render observes remote changes and newly fetched commits.
function commitWebUrl(cwd, hash, override, cache) {
    if (!/^[a-f0-9]{4,64}$/i.test(hash)) return;
    if (!cache.has(cwd)) cache.set(cwd, { template: override || repositoryTemplate(cwd), hashes: new Map() });
    const { template, hashes } = cache.get(cwd);
    if (!template || !template.includes('{commit}')) return;
    if (!hashes.has(hash)) {
        const full = git(cwd, ['rev-parse', '--verify', hash + '^{commit}']);
        hashes.set(hash, full || hash);
    }
    try {
        const url = new URL(template.replace(/\{commit\}/g, hashes.get(hash)));
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch { /* A malformed workspace template has no web destination. */ }
}

module.exports = { commitWebUrl };
