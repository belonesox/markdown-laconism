const vscode = require('vscode');

module.exports = function(md, outputChannel) {

    // Функция логгирования, проверяющая настройку
    function log(msg) {
        if (!outputChannel) return;
        
        // Читаем конфиг каждый раз, чтобы можно было включить лог без перезагрузки
        const config = vscode.workspace.getConfiguration('markdown-laconism');
        if (config.get('debug')) {
            outputChannel.appendLine(msg);
        }
    }

    // Fallback парсер размеров (если imsize не справился или отключен)
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

    // Сохраняем предыдущий рендерер (обычно это image из плагина bierner)
    const previousRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.image = function(tokens, idx, options, env, self) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex('src');
        
        if (srcIndex >= 0) {
            let src = token.attrs[srcIndex][1];
            
            // --- ЛОГИКА ИЗВЛЕЧЕНИЯ ALT ---
            let alt = token.content || '';
            if (!alt && token.children && token.children.length > 0) {
                alt = token.children.reduce((acc, child) => acc + (child.content || ''), '');
            }

            // --- РАЗМЕРЫ ---
            // 1. Из атрибутов (работа Bierner)
            let width = token.attrGet('width');
            let height = token.attrGet('height');
            let title = token.attrGet('title') || '';
            
            // 2. Fallback
            if (!width && !height) {
                const sizeInSrc = parseSizeFallback(src);
                if (sizeInSrc) {
                    width = sizeInSrc.width;
                    height = sizeInSrc.height;
                    src = sizeInSrc.cleanStr.trim();
                } else if (title) {
                    const sizeInTitle = parseSizeFallback(title);
                    if (sizeInTitle) {
                        width = sizeInTitle.width;
                        height = sizeInTitle.height;
                        title = sizeInTitle.cleanStr;
                    }
                }
            }

            // --- WEBM -> VIDEO ---
            if (src.toLowerCase().trim().endsWith('.webm')) {
                
                // Если title пустой, используем alt
                const finalTitle = (title && title.trim()) ? title : alt;

                log(`[WEBM] ${src}`);
                log(`   -> Size: ${width || 'auto'}x${height || 'auto'}`);
                log(`   -> Title: "${finalTitle}"`);

                let style = 'max-width: 100%;'; 
                if (width) style = `max-width: ${width}; width: ${width};`;
                if (height) style += ` height: ${height};`;

                const safeSrc = md.utils.escapeHtml(src);
                const safeTitle = md.utils.escapeHtml(finalTitle);
                const safeAlt = md.utils.escapeHtml(alt);

                // Добавляем data-alt для удобства отладки или CSS селекторов
                return `<video src="${safeSrc}" loop controls autoplay muted crossorigin="anonymous" style="${style}" title="${safeTitle}" data-alt="${safeAlt}">
                        Ваш браузер не поддерживает video тег.
                        </video>`;
            }
        }
        
        return previousRender(tokens, idx, options, env, self);
    };

    // --- ОБРАБОТКА ССЫЛОК ---
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
            return `<code><a href="${href}" class='cnig-filelink'>${linkText}</a></code>`;
        }
        return defaultCodeInline(tokens, idx, options, env, self);
    };

    return md;
};
