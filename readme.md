Conveniences for brevity in Markdown - transclusions, video inclusions, hyperlinks to other documents in the code.

---

Markdown has become the dominant plain-text markup language. With a zero learning curve, it's familiar to almost everyone in IT and AI, essentially burying the widespread use of `SGML`, `[X]HTML`, `Dita`, `LaTeX`, `AsciiDoc`, `RST`, `[Media]Wiki`, and other, perhaps smarter, markup languages.

Perhaps this is for the best. Markdown support in code-server (along with LaTeX math, graphs, and a host of other features) allows you to efficiently create technical documentation and educational materials without worrying about the complexities of book pagination or relying on monstrous solutions like `pandoc`.

This is especially true considering you can insert almost arbitrary HTML blocks into Markdown whenever you need something specific, interactive, or visual.

However, some things in Markdown can be improved right out of the box:
- Without inventing new extensions (the pandoc approach).
- Without adding new markup elements.
- By expanding the ideas already inherent in Markdown, allowing you to achieve more compact and effective results using the same syntax.

For example, in educational materials and technical documentation, it's incredibly useful to insert small, illustrative media clips—like pictures, but alive, straight out of the Harry Potter world.

The classic approach using `<div><video …>…</video>` tags is extremely bulky, especially when your document contains many of these «living pictures.»

We extend the «inclusion» functionality, seamlessly integrating with the `markdown-image-size` extension semantics, so you can include not only images:
`![ALT]`&#8203;`(path-to-image.png =WidthxHeight)`
but also videos:
`![classes and styles]`&#8203;`(path-to-video.webm =WidthxHeight)`

Another major pain point is the **transclusion** of other Markdown documents. This feature is available out of the box in almost all other major markup languages (LaTeX, SGML Docbook, MediaWiki, RST, etc.), but is missing here.

We achieve this «transclusion» by expanding the inclusion semantics once again:
`![classes and styles]`&#8203;`(path-to-markdown-document.md)`
- *Note:* If you specify an absolute path, the inclusion will be resolved relative to your project workspace folder (`${workspaceFolder}`).

Another frequent necessity is automatic hyperlinking to adjacent Markdown documents and other codebase artifacts.
To solve this, inline code literals starting with `./`, such as:
`./path-to/some/artifact.py`
are automatically converted into hyperlinks relative to the current path.

Furthermore, if the link points to a Markdown document, a link like:
`./path-to/some/artifact.md`
(which can already be made clickable in the editor using other VS Code / code-server extensions) is converted into an HTML link:
`./path-to/some/artifact.html`.
This allows you to seamlessly turn a collection of standalone Markdown documents into interconnected technical documentation or a cohesive knowledge base.
