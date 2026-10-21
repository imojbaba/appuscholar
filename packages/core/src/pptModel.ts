/* v1's "Make a PPT from the document" (index.html 4947-5030), the parts that compute: docToSlideModel (4954-4987), pptxBuildPreview's rules (4988-5008: the no-heading warning when
   no slide has a title, 8 bullets of 200 characters per slide) and pptxDownload's (5009-5030: 10 bullets of 300 characters per slide, the first picture, the file name).
   Heading 1, 2 and 3 start a slide; a paragraph or a list item under it becomes a bullet; a table is one bullet; a paragraph that holds a picture gets no bullet (its pictures go to the
   slide); the model keeps every bullet, and the caps are applied where the preview and the file are made.
   docToSlideModel's logic is v1's text, with `editor.children` read from the parsed HTML and `getEditorText()` and the document's title lifted into the parameters.
   What differs from v1's text:
   - docToSlideModel(html, docTitle) takes the document's HTML (v1 reads the attached `#editor`) and its title (v1: `(docsGet().find(d=>d.id===docCurrentId())||{}).title||'Untitled'`;
     here `docTitle||'Untitled'`, so null, undefined and "" all give 'Untitled'). The HTML is parsed as an element's innerHTML is, in a DOMParser document, which runs no script and
     loads no picture. It needs the platform's DOMParser (a browser's, or jsdom's under test); it throws where there is none;
   - `textOf` and `getEditorText` read textContent (register D-S2-95): v1 reads `innerText` of the attached editor, which a browser renders with line breaks for `<br>`, blocks and list
     items and which jsdom (v1's golden capture) does not have. A `<br>` inside a paragraph, or one list item inside another, therefore reads without a separator here
     (`<p>line<br>break</p>` is "linebreak"); the no-heading fallback below, which splits the whole text on newlines, sees newlines only where the document's text nodes hold them;
   - `img.src` is the property, as v1 reads it, resolved against the parsing document's URL: absolute and data: pictures (all the editor's sanitiser keeps) come out as v1's do, and an
     `src=""` resolves to that URL in jsdom and is not covered by a golden;
   - v1's `n.querySelectorAll&&…` and `n.querySelector&&…` guards are dropped: every child of `children` is an Element and has both;
   - pptHasHeadings(slides) is v1's `slides.some(s=>s.title)` that picks the warning; pptPreviewBullets(bullets) is the preview's `s.bullets.slice(0,8).map(b=>b.slice(0,200))`;
   - pptxFileName(title) is pptxDownload's `safe+'.pptx'` (`title||'appuscholar-slides'`, then `replace(/[^\w\- ]+/g,'').trim()||'appuscholar-slides'`);
   - pptxDeckSpec(slides) is what pptxDownload told PptxGenJS, as data (master, then per slide the title text, the bullets, the first picture) with v1's numbers, so the page needs only
     to hand it to the library; the `try{…}catch(e){}` around addImage stays the caller's.
   A document with no headings and only paragraphs is one slide with a null title, not one titled with the document's name (v1's fallback to the whole text, with the document's title,
   is reached only when no slide came out of the nodes: text outside any element, or a paragraph whose only content is a picture with no src). */

export const PPT_MAX_BULLETS=10;
export const PPT_PREVIEW_BULLETS=8;
export const PPT_BULLET_CHARS=300;
export const PPT_PREVIEW_CHARS=200;

export type PptSlide = { title: string | null; bullets: string[]; images: string[] };

function parseRoot(html: string): Element{
  if(typeof DOMParser==='undefined')throw new Error('docToSlideModel needs a DOMParser (a browser, or jsdom under test)');
  const doc=new DOMParser().parseFromString('','text/html');
  const root=doc.createElement('div');
  root.innerHTML=html;
  return root;
}

export function docToSlideModel(html: string,docTitle?: string | null): PptSlide[]{
  const editor=parseRoot(html);
  const nodes=Array.from(editor.children);
  const slides: PptSlide[]=[];
  let cur: PptSlide | null=null;
  function pushCur(){if(cur&&(cur.title||cur.bullets.length||cur.images.length))slides.push(cur)}
  function textOf(n: Element){return (n.textContent||'').trim()}
  nodes.forEach(n=>{
    const tag=n.tagName;
    if(tag==='H1'||tag==='H2'||tag==='H3'){
      pushCur();cur={title:textOf(n),bullets:[],images:[]};
      return;
    }
    if(!cur)cur={title:null,bullets:[],images:[]};
    const slide: PptSlide=cur;
    if(tag==='UL'||tag==='OL'){
      Array.from(n.children).forEach(li=>{const t=textOf(li);if(t)slide.bullets.push(t)});
    }else if(tag==='TABLE'){
      const rows=Array.from((n as HTMLTableElement).rows).map(r=>Array.from(r.cells).map(c=>textOf(c)).join(' | '));
      if(rows.length)slide.bullets.push('Table: '+rows.join(' — '));
    }else{
      n.querySelectorAll('img').forEach(img=>{if(img.src)slide.images.push(img.src)});
      const t=textOf(n);
      if(t&&!n.querySelector('img'))slide.bullets.push(t);
    }
  });
  pushCur();
  if(!slides.length){
    const whole=(editor.textContent||'').trim();
    if(whole){
      const parts=whole.split(/\n+/).map(s=>s.trim()).filter(Boolean).slice(0,10);
      slides.push({title:docTitle||'Untitled',bullets:parts,images:[]});
    }
  }
  return slides;
}

/** pptxBuildPreview's `hasHeadings`: false makes it print the "No Heading 1/2/3 found" warning. */
export function pptHasHeadings(slides: PptSlide[]): boolean{return slides.some(s=>s.title)}
/** The bullets the preview shows for a slide: the first 8, each cut at 200 characters. */
export function pptPreviewBullets(bullets: string[]): string[]{return bullets.slice(0,PPT_PREVIEW_BULLETS).map(b=>b.slice(0,PPT_PREVIEW_CHARS))}
/** pptxDownload's file name for the open document's title (undefined, null or "" when it has none). */
export function pptxFileName(title?: string | null): string{
  const t=title||'appuscholar-slides';
  const safe=t.replace(/[^\w\- ]+/g,'').trim()||'appuscholar-slides';
  return safe+'.pptx';
}

export type PptxText = { text: string; options: Record<string, unknown> };
export type PptxDeck = {
  master: { title: string; background: { color: string } };
  slides: Array<{
    title: PptxText | null;
    bullets: { items: Array<{ text: string; options: { bullet: boolean; breakLine: boolean } }>; options: Record<string, unknown> } | null;
    image: { data: string; x: number; y: number; w: number; h: number } | null;
  }>;
};
/** What pptxDownload (5009-5030) hands PptxGenJS for a slide model: the master, then per slide the title, the bullets (first 10, 300 characters each) and the first picture. */
export function pptxDeckSpec(slides: PptSlide[]): PptxDeck{
  return{
    master:{title:'APPU',background:{color:'FFFFFF'}},
    slides:slides.map(s=>{
      let y=0.4;
      let title: PptxText | null=null;
      if(s.title){title={text:s.title,options:{x:0.5,y,w:9,h:1,fontSize:28,bold:true,color:'5B21B6',fontFace:'Georgia'}};y+=1.1}
      const bullets=s.bullets.length?{
        items:s.bullets.slice(0,PPT_MAX_BULLETS).map(b=>({text:b.slice(0,PPT_BULLET_CHARS),options:{bullet:true,breakLine:true}})),
        options:{x:0.5,y,w:9,h:5.5-y,fontSize:16,color:'1E1B2E',fontFace:'Georgia',valign:'top'},
      }:null;
      const first=s.images.slice(0,1)[0];
      const image=first!==undefined?{data:first,x:5.3,y:1.3,w:4,h:3}:null;
      return{title,bullets,image};
    }),
  };
}
