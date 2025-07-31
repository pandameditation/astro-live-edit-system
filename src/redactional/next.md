

TODO 02:
I want to remove all empty tags like <ul style="list-style-type: '✅ ' "></ul> that could pollute my DOM. Ideally I would remove these from the browser directly not to pass them on the server.




---



DONE 01: 

Right now it removes the code fences in markdown files on saving: 
```
---
layout: ../../layouts/BaseLayout.astro
---
```
got entirely stripped out. How can I make sure the fences stay intact?


DONE 02:
When I save .md files, all tabs indentation is gone. This is bad for indented lists which are flattened. How can I fix that ?
e.g.: ```
- This is it
- pouet
- Pouet
    - duoPouet
- again
``` 
becomes 
```
- This is it
- pouet
- Pouet
- duoPouet
- df
- again
```
when I added the `df` line


DONE 03:
something like `<div>pouet</div>` does not save on the proper line.
In my example I have : 
```
  <div>pouet</div>
  <h1>Bienvenue sur notre site</h1>
  <div>pouet</div>
  ```
  when I modify the second `pouet` to be `pouetre`, I save, the first pouet becomes `pouetre` but the second one is untouched. It seems to be a problem in the tag detection. I don't understand why it thinks this is the first block? The position of `loc` sends to the correct position of the `p` of the second `pouet` in the source file.


DONE04:

When having this :
```
- This is it
- 
- 
- again
```

And adding `pouet` to the second bullet in the browser, it transformed the list into:
```
- This is it
- pouet

- again
```
It should not create this empty row between the list items... for reference the content sent from browser: `"content": "<li>This is it</li>\n<li>pouet</li>\n<li>\n</li>\n<li>again</li>"`

---
DONE05 : 
Make sure that markdown works properly. 
When rendering 
```
pouet
1. I am superHappyyyyy
2. fdsdf
```
It doesn't differentiate the block pouet and the list in the server that generates source.
Because of that if I create `pouet<br/>dad` instead of `pouet`, it also erases the full list below. 
That doesn't happen if we have a line break between pouet and the list. 


we want a  more robust handling of the different markdown with `findMarkdownBlock`

---
TODO : 
- ~~Better handling of .md edge case scenarii~~
- ~~Edit the source file of .md directly in the browser (query the source file from server, edit in in the browser in a proper editor, send the full file to the server).~~
- Version history of latest changes in the source code : before writing to file, we save the current version of the file with a version number. The new version is then saved in the source file. The old version is saved in a specific file that contains all version history. The browser can query this file and get different versions. They can choose one version and replace the code with it.
- Automatic testing of the editor with many scenarii prepared
- Hot module reload, or page reload after saving and changes happen in source.
- Tech debt : (Use outerHTML instead of innerHTML to remove the dependency on tagName and simplify the code) -> Because with innerHTML I miss all the attributes on the parent node. With this change, instead of parsing the node backward and then injecting the content inside the detected node, we would inject the content in place of it.
- Adding new blocks in the browser, managing a library of blocks. New blocks are appended to the source file on save.