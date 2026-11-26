// markdown-it keeps the raw label in content. markdown-it-imsize only sets children.
module.exports = function imageAlt(token) {
    return token.content || (token.children || []).map(child => child.content).join('') || token.attrGet('alt') || '';
};
