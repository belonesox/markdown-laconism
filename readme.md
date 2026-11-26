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

Also, you can specify width of included images, videos using syntax like `w20%` (width of `20%`) in alt block, like
`![right,w20%]`&#8203;`(./someimage.png)` — this is more convenient, becase dont break stadard hyperlinking and "rename symbol" functionality.

If we in image translusion tag we see URL ended with `.htm` or `.html`, we can conclude, that here should be image-link, that is QR-code. 
- Or we should use it for `iframe`? Definitely iframes are rare, but QR-links may be frequently used in presentations. Exprerimental feature.
- If you also force qrcoding for any URL using `qrcode` spec in ALT block, like `![right,qrcode,w20%]`&#8203;`(https://t.me/somebody)`

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

### Include a table in the Markdown preview

Put a local CSV or XLSX image reference in its own paragraph. Paths are relative to the Markdown file containing the reference, including inside a transcluded document.

<pre><code>!&#91;rows=0;-3:, cols=0;2:4, trans](./current-portfolio.csv)

!&#91;sep=semicolon, header=none](./measurements.csv)

!&#91;sheet="Portfolio, EUR", rows=0:5, styles](./portfolio.xlsx)</code></pre>

- `rows` and `cols` default to the full table. Indices start at zero, a slice excludes its end, and negative indices count from the end. Join selections with `;` to keep the specified order. Overlapping selections include each index once.
- Source row zero supplies the column headings when selected. `header=none` treats it as data. `trans` exchanges rows and columns after selection, so the headings become row labels.
- CSV uses UTF-8 and defaults to `sep=comma`. Other delimiters are `sep=semicolon`, `sep=tab` and `sep=dblquote`. The last one treats each double quote as a separator and disables CSV quoting.
- XLSX uses the first sheet by default. Number and date formats apply to displayed values. Formulas use the result saved in the workbook. ⁇ marks a formula without a saved result. Add `styles` to include bold, italic, horizontal alignment and explicit RGB font and solid fill colors.
- The preview loads uncached selections in the background and checks source timestamps while the Markdown document is open. Selections are cached under `.vscode/.cache/md-laconism/` when the workspace is writable.

### Include a text file as a code block

Place the reference in its own paragraph. The preview reads the file relative to the Markdown document that contains it and preserves indentation, blank lines and literal Markdown. The same path rules apply inside an included Markdown document.

<pre><code>!&#91;](./example.txt)

!&#91;](./diagram.py)

!&#91;type=yaml](./config.yaml)

!&#91;type=mermaid](./diagram.generated)

!&#91;type=text](./diagram.py)</code></pre>

Common extensions select the language for a fenced code block. For example, <code>.py</code> selects Python and <code>.yml</code> selects YAML. Unknown extensions default to plain text. Common extensionless filenames such as Makefile and Dockerfile also select a language. Use <code>type=LANGUAGE</code> to choose the same renderer as a Markdown fence, including Mermaid diagrams, or <code>type=text</code> to turn highlighting off. UTF-8 and BOM-marked UTF-16 files are supported. Saving the source updates the open preview.

Use <code>rows</code> to quote lines and <code>cols</code> to select characters within each chosen line. Both use the table syntax. Indices start at zero, the end of a slice is exclusive, and negative indices count from the end. Separate selections with <code>;</code> to specify their order. Overlapping indices appear once.

<pre><code>!&#91;rows=10:15](./example.py)

!&#91;type=text, rows=0;-3:, cols=8:](./server.log)</code></pre>

The first example shows lines 11 through 15 with Python highlighting. The second shows the first line and the last three, starting at the ninth character of each. Blank lines count as rows. A final line ending adds no extra row. Columns count Unicode code points, including a tab as one character. Positions beyond a short line are skipped. Highlighting applies to the excerpt.

For Mermaid, enable one Markdown preview renderer. Use the built-in Mermaid support when available. In versions of VS Code or code-server without it, install <code>bierner.markdown-mermaid</code>.
