module.exports = function(md) {
    // ------------------------------------------------------------------
    // 1. Обработка картинок (WEBM -> VIDEO)
    // ------------------------------------------------------------------
    const defaultImageRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.image = function(tokens, idx, options, env, self) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex('src');
        
        if (srcIndex >= 0) {
            const src = token.attrs[srcIndex][1];
            // Проверка расширения .webm
            if (src.toLowerCase().endsWith('.webm')) {
                const alt = token.content;
                return `<video src="${src}" loop controls autoplay muted crossorigin="anonymous" style="max-width: 100%;" title="${alt}">
                        Ваш браузер не поддерживает video тег.
                        </video>`;
            }
        }
        return defaultImageRender(tokens, idx, options, env, self);
    };

    // ------------------------------------------------------------------
    // 2. Обработка инлайн-кода (начинающегося с ./)
    // ------------------------------------------------------------------
    const defaultCodeInline = md.renderer.rules.code_inline || function(tokens, idx, options, env, self) {
         return '<code' + self.renderAttrs(tokens[idx]) + '>' + 
                md.utils.escapeHtml(tokens[idx].content) + 
                '</code>';
    };

    md.renderer.rules.code_inline = function(tokens, idx, options, env, self) {
        const token = tokens[idx];
        const rawContent = token.content;

        // Если контент в backticks начинается с "./"
        if (rawContent.startsWith('./')) {
            let href = rawContent;
            
            // Если файл заканчивается на .md, меняем ссылку на .html
            if (href.toLowerCase().endsWith('.md')) {
                href = href.substring(0, href.length - 3) + '.html';
            }

            // Текст ссылки оставляем оригинальным (с .md), но экранируем спецсимволы
            const linkText = md.utils.escapeHtml(rawContent);
            
            // Собираем конструкцию: <code><a href="..." ...>текст</a></code>
            return `<code><a href="${href}" class='cnig-filelink'>${linkText}</a></code>`;
        }

        // Иначе стандартное поведение
        return defaultCodeInline(tokens, idx, options, env, self);
    };

    return md;
};
