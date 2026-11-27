Markdown has become the dominant plain-text markup language. Almost everyone in IT and AI already knows it. Formats such as SGML, [X]HTML, DITA, LaTeX, AsciiDoc, reStructuredText and MediaWiki have largely given way to it in everyday documentation.

Perhaps that's for the best. With Markdown in code-server, you can write technical documentation and teaching materials with LaTeX equations and diagrams without spending time on page layout or setting up a publishing toolchain such as Pandoc. When you need something interactive or visual, you can embed HTML directly.

Some everyday tasks could still be simpler. Markdown Laconism extends familiar Markdown syntax so that you can express more with the markup you already use.

#### Including video and Markdown documents

Short video clips can illustrate a point in a tutorial as neatly as a picture, especially when the picture moves, Harry Potter style. Repeating `<div><video>…</video></div>` for every clip makes the Markdown cumbersome to read.

The extension uses the same inclusion syntax for images and WebM videos, including the dimensions supported by `markdown-image-size`.

<pre><code>!&#91;alt text](path/to/image.png =WidthxHeight)

!&#91;classes and styles](path/to/video.webm =WidthxHeight)</code></pre>

Including one document inside another (transclusion) is familiar from LaTeX, DocBook, MediaWiki and reStructuredText. It's useful in Markdown too, whether you want to reuse a section of prose, quote a few lines from a log or configuration file, or include a table that's easier to maintain in CSV or Excel.

Use the same syntax to include another Markdown document. A path starting with `/` is resolved from the project workspace folder (`${workspaceFolder}`).

<pre><code>!&#91;classes and styles](path/to/document.md)</code></pre>

#### Including tables

Put a local CSV or XLSX reference in its own paragraph. The path is relative to the Markdown file containing the reference.

<pre><code>!&#91;rows=0;-3:, cols=0;2:4, trans](./current-portfolio.csv)

!&#91;sep=semicolon, header=none](./measurements.csv)

!&#91;sheet="Portfolio, EUR", rows=0:5, styles](./portfolio.xlsx)</code></pre>

- `rows` and `cols` select rows and columns from the source table using Python-style slices. Indices start at zero, a slice excludes its end, and negative indices count from the end. Join selections with `;` to specify their order. Overlapping indices appear once.
- If you select source row zero, its cells supply the column headings. Use `header=none` to treat that row as data.
- `trans` swaps rows and columns after selection. In the first example, the field names appear on the left and the values from the last three records appear to their right.
- CSV files use UTF-8. The default delimiter is `sep=comma`. You can also specify `sep=semicolon`, `sep=tab` or `sep=dblquote`.
- For XLSX, the first worksheet is selected by default. Use `sheet` to select a worksheet by name.
- Dates and numbers use the cell's display format. Formulas show the result saved in the workbook. A `⁇` marks a formula with no saved result.
- Add `styles` to include bold, italic, horizontal alignment and explicit RGB colors for text and solid fills.
- Saving a source file updates the preview. Table selections are cached in `.vscode/.cache/md-laconism/`. Add this directory to your project's `.gitignore`.

### Including a text file as a code block

Put the reference in its own paragraph. The path is relative to the Markdown file that contains it, including when that file is itself included in another document. The block preserves indentation, blank lines and literal Markdown characters.

<pre><code>!&#91;](./example.txt)

!&#91;](./diagram.py)

!&#91;type=yaml](./config.yaml)

!&#91;type=mermaid](./diagram.generated)

!&#91;type=text](./diagram.py)</code></pre>

The file extension usually determines the highlighting language, for example Python for `.py` and YAML for `.yml`. Recognized filenames such as `Makefile` and `Dockerfile` also select a language. Other files default to plain text. Set `type=LANGUAGE` to select the same renderer you would use for a fenced code block. For example, `type=mermaid` renders a diagram, and `type=text` displays even a Python file without highlighting. UTF-8 and BOM-marked UTF-16 files are supported.

Use `rows` and `cols` to quote a small example from a large log or configuration file. The slice syntax is the same as for tables. Here, `rows` selects lines and `cols` selects characters within each selected line. Blank lines count. A final line ending adds no extra row. Columns count Unicode code points, with a tab occupying one position. Positions beyond the end of a short line are skipped. Highlighting applies to the resulting excerpt.

<pre><code>!&#91;rows=10:15](./example.py)

!&#91;type=text, rows=0;-3:, cols=8:](./server.log)</code></pre>

The first example shows lines 11 through 15 with Python highlighting. The second shows the first line and the last three, starting at the ninth character of each.

For Mermaid, enable one Markdown preview renderer. Use the built-in Mermaid support when available. In versions of VS Code or code-server without it, install `bierner.markdown-mermaid`.

### Linking to nearby files and chapters

To link to a file and show its path as the label, put the path in backticks and start it with `./`. To go up one directory, keep that prefix and start with `./../`.

```markdown
- Order submission — `./../logic/portfolio/neos_transport.py`
- Building QUIK orders — `./../logic/portfolio/quik_orders.py`
- Read more → `./03_markowitz.md`
```

In the preview, the first two links open Python files and the third opens the Markdown chapter. If you export each chapter to an HTML file alongside its Markdown source, for example with Freeze Markdown, the third link points to `./03_markowitz.html` in the exported overview. Readers can follow the same chapter reference in the IDE and on the published site.

### Linking to a passage in source code and including it in the document

An architecture overview can explain an idea in a few lines and link readers to the code or configuration that implements it. The link should take them to the relevant passage whether they're reading the Markdown source in VS Code or code-server, or browsing the published HTML. The extension uses the standard text fragment syntax for both links and includes. [Text fragments on MDN](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments)

Append `#:~:text=start` to a path to select a phrase, or `#:~:text=start,end` to select a range including both terms. For example, an overview might link to the method that starts a calculation and quote the relevant part of its configuration.

<pre><code>The calculation starts in the &#91;run_hist method](../logic/opt_algo.py#:~:text=def%20run_hist).

The project configuration lists the bonds that can be traded.

!&#91;](../logic/portfolio/config.py#:~:text=TRADABLE_BONDS,%7D)</code></pre>

Put the include in its own paragraph. This block starts at `TRADABLE_BONDS` and ends at the next closing brace, `}` (encoded as `%7D`). The link at the upper right shows the full path from the include, `../logic/portfolio/config.py ↗`. Click it to open the same passage in the source. Use `source_link=0` to hide the link for an individual block.

<pre><code>!&#91;source_link=0](../logic/portfolio/config.py#:~:text=TRADABLE_BONDS,%7D)</code></pre>

When combined with a text fragment, `rows` and `cols` select within the matched passage. The source link still points to the range in the URL. For an include without `#:~:text=`, it opens the whole file.

When publishing, configure the web server to serve source files as `text/plain; charset=utf-8` so the browser can display the file and highlight the requested passage.

#### Choosing among repeated matches

Matching ignores case and selects the first occurrence. To identify a particular occurrence, add the surrounding text as context. Context can touch the match or be separated from it by whitespace. The selection and the quoted block contain only the matched text.

| URL fragment | Text selected |
| --- | --- |
| `#:~:text=foo-,bar` | `bar` immediately after `foo`. |
| `#:~:text=foo,-bar` | `foo` immediately before `bar`. |
| `#:~:text=prefix-,start,end,-suffix` | The range from `start` through `end`, with `prefix` on the left and `suffix` on the right. |

Use one `text=` directive per link. Within search terms and context, encode a space as `%20`, a comma as `%2C`, an ampersand as `%26` and a hyphen as `%2D`. Keep the commas and hyphens that delimit the context as shown in the examples.

### Linking to a Git commit with `diff://`

To show which change introduced the behavior you're describing, use the commit hash in a Markdown link. This is useful in a code review or a write-up of completed work, including when the repository has no web interface or the commit is still local.

This example points to a commit in the extension's own history.

<pre><code>&#91;Changes to include tables and text files](diff://a24f042)</code></pre>

In the Markdown editor, Ctrl+click the address `diff://a24f042` to open a read-only virtual document with diff highlighting. It shows the commit details, message and patch, with added and removed lines marked by `+` and `-`, as in `git show --color=never a24f042`.

For your project, use a full hash or an unambiguous abbreviation from `git log --oneline`. For this local view, Git runs in the **first folder of the open workspace**, even if the Markdown document is in a different folder. The commit must be available in that repository's history. If no workspace folder is open or Git cannot find the commit, the virtual document shows an error message.

#### The same commit in the preview and published HTML

In the Markdown preview, clicking the link opens the commit page on the Git host. Freeze Markdown writes that web URL into the exported HTML, so readers need only a browser and access to the repository. The extension reads the local Git configuration when rendering. The commit must have been published to the selected repository for readers to view it there.

To build the web link, the extension looks for a repository starting in the directory of the Markdown file containing the link. It checks the fetch URL of `origin` first, then the other remotes until it recognizes GitHub or GitLab in the host or remote name. For example, if `origin` points to a local directory and `upstream` points to GitLab, the link uses `upstream`. If Git can resolve a short hash locally, the URL uses the full hash. Otherwise it keeps the hash from the link.

| Git remote URL | Commit page URL |
| --- | --- |
| `git@github.com:team/project.git` | `https://github.com/team/project/commit/{commit}` |
| `ssh://git@gitlab.example.org:2222/team/subgroup/project.git` | `https://gitlab.example.org/team/subgroup/project/-/commit/{commit}` |

For another Git host, an SSH alias or a particular mirror, set a template in the project's `.vscode/settings.json`. It takes precedence over remote detection. Use the full HTTP or HTTPS URL of a commit page and replace the hash with `{commit}`.

```json
{
  "markdown-laconism.commitUrlTemplate": "https://git.example.org/team/project/changeset/{commit}"
}
```

An empty setting enables automatic detection. If the extension cannot determine a web URL, the preview and export retain the `diff://` address. Set the template and export again to update links in previously generated HTML.
