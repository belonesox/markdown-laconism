(function (factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === 'function' && define.amd) {
        define(["require", "exports"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.activate = void 0;

    // Fallback парсер размеров
    function parseSizeFallback(str) {
        if (!str) return null;
        let decoded = str;
        try { decoded = decodeURI(str); } catch (e) {}
        
        const regex = /(?:\s|%20)*=(\d+(?:%|px|em|rem|vw|vh)?)?x(\d+(?:%|px|em|rem|vw|vh)?)?(?:\s|%20)*$/;
        const match = decoded.match(regex);
        if (match) {
            return { width: match[1], height: match[2], cleanStr: decoded.replace(regex, '') };
        }
        return null;
    }

    function activate(ctx) {
        return {
            extendMarkdownIt: function(md) {
                console.log('[Markdown Laconism] Jupyter Webview features activated!');

                // 0. РАЗРЕШАЕМ КАСТОМНЫЕ СХЕМЫ ССЫЛОК (diff://, find:// и т.д.)
                const originalValidateLink = md.validateLink;
                md.validateLink = function (url) {
                    if (/^(diff|find):\/\//i.test(url)) return true;
                    return originalValidateLink(url);
                };

                // 1. ПРЕПРОЦЕССОР
                md.core.ruler.before('normalize', 'imsize_preprocess', function (state) {
                    state.src = state.src.replace(/(!\[.*?\]\([^)\s"]+)\s+=([0-9.%a-zA-Z]+)?x([0-9.%a-zA-Z]+)?\)/g, function(match, prefix, w, h) {
                        return `${prefix}#imsize=${w || ''}x${h || ''})`;
                    });
                });

                // 2. РЕНДЕРЕР
                const previousRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
                    return self.renderToken(tokens, idx, options);
                };

                md.renderer.rules.image = function(tokens, idx, options, env, self) {
                    const token = tokens[idx];
                    const srcIndex = token.attrIndex('src');
                    
                    if (srcIndex >= 0) {
                        let src = token.attrs[srcIndex][1];
                        let alt = token.content || '';
                        if (!alt && token.children && token.children.length > 0) {
                            alt = token.children.reduce((acc, child) => acc + (child.content || ''), '');
                        }

                        let width = token.attrGet('width');
                        let height = token.attrGet('height');
                        let title = token.attrGet('title') || '';
                        
                        const imsizeIndex = src.indexOf('#imsize=');
                        if (imsizeIndex >= 0) {
                            const sizeStr = src.substring(imsizeIndex + 8);
                            const [w, h] = sizeStr.split('x');
                            width = w || width;
                            height = h || height;
                            src = src.substring(0, imsizeIndex);
                            token.attrs[srcIndex][1] = src;
                        } 
                        else if (!width && !height && title) {
                            const sizeInTitle = parseSizeFallback(title);
                            if (sizeInTitle) {
                                width = sizeInTitle.width;
                                height = sizeInTitle.height;
                                title = sizeInTitle.cleanStr;
                                token.attrSet('title', title);
                            }
                        }

                        if (width) token.attrSet('width', width);
                        if (height) token.attrSet('height', height);

                        let decodedSrc = src;
                        try { decodedSrc = decodeURI(src); } catch(e) {}

                        // ОБРАБОТКА QR-КОДОВ
                        if (/^https?:\/\/.+\.html?(\s*=.*)?$/i.test(decodedSrc)) {
                            const safeUrl = md.utils.escapeHtml(decodedSrc);
                            const safeAlt = md.utils.escapeHtml(alt || 'QR Code');
                            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&qzone=1&data=${encodeURIComponent(decodedSrc)}`;
                            
                            let style = 'max-width: 100%;';
                            if (width) style += ` width: ${width};`;
                            if (height) style += ` height: ${height};`;
                            
                            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="cnig-qr-link">
                                        <img src="${qrApiUrl}" alt="${safeAlt}" style="${style}" class="markdown-laconism-qr" />
                                    </a>`;
                        }

                        // ОБРАБОТКА ВИДЕО (.webm, .mp4)
                        if (decodedSrc.toLowerCase().trim().endsWith('.webm') || decodedSrc.toLowerCase().trim().endsWith('.mp4')) {
                            const finalTitle = (title && title.trim()) ? title : alt;
                            let style = 'max-width: 100%;'; 
                            if (width) style = `max-width: ${width}; width: ${width};`;
                            if (height) style += ` height: ${height};`;

                            const safeSrc = md.utils.escapeHtml(src);
                            const safeTitle = md.utils.escapeHtml(finalTitle);
                            return `<video src="${safeSrc}" loop controls autoplay muted crossorigin="anonymous" style="${style}" title="${safeTitle}" data-alt="${md.utils.escapeHtml(alt)}">
                            Your browser does not support the video tag.
                            </video>`;
                        }

                        // ОБРАБОТКА КАРТИНОК
                        if (width || height) {
                            let imgStr = `<img src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(alt)}"`;
                            if (title) imgStr += ` title="${md.utils.escapeHtml(title)}"`;
                            if (width) imgStr += ` width="${md.utils.escapeHtml(width)}"`;
                            if (height) imgStr += ` height="${md.utils.escapeHtml(height)}"`;
                            imgStr += ' />';
                            return imgStr;
                        }
                    }
                    
                    return previousRender(tokens, idx, options, env, self);
                };

                // 3. ИНЛАЙН-ССЫЛКИ
                const defaultCodeInline = md.renderer.rules.code_inline || function(tokens, idx, options, env, self) {
                     return '<code' + self.renderAttrs(tokens[idx]) + '>' + 
                            md.utils.escapeHtml(tokens[idx].content) + 
                            '</code>';
                };

                md.renderer.rules.code_inline = function(tokens, idx, options, env, self) {
                    const rawContent = tokens[idx].content;
                    if (rawContent.startsWith('./')) {
                        let href = rawContent;
                        if (href.toLowerCase().endsWith('.md')) {
                            href = href.substring(0, href.length - 3) + '.html';
                        }
                        const linkText = md.utils.escapeHtml(rawContent);
                        return `<code><a href="${md.utils.escapeHtml(href)}" class='cnig-filelink'>${linkText}</a></code>`;
                    }
                    return defaultCodeInline(tokens, idx, options, env, self);
                };

                return md;
            }
        };
    }
    exports.activate = activate;
});