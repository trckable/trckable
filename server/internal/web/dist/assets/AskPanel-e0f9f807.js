import{i as e,t}from"./react-9bbe84d6.js";import{hn as n,l as r}from"./index-6556ae1b.js";import{t as i}from"./Code-1070d96a.js";var a=e(),o={title:`Peek`,label:`Peek`,close:`Close Peek`,intro:`Connect your own assistant over MCP.`,docs:`https://trckable.com/docs/api/mcp/`,docsLink:`Setup`,note:`Read-only tools. Paste the key where it says tkb_live_…`,key:`Create a key`},s=t(),c=e=>`{
  "mcpServers": {
    "trckable": {
      "command": "npx",
      "args": ["-y", "trckable", "mcp"],
      "env": { "TRCKABLE_HOST": "${e}", "TRCKABLE_API_KEY": "tkb_live_…" }
    }
  }
}`;function l({onClose:e}){return(0,s.jsxs)(`div`,{className:`ask-setup`,children:[(0,s.jsxs)(`p`,{children:[o.intro,` `,(0,s.jsx)(`a`,{href:o.docs,target:`_blank`,rel:`noopener noreferrer`,children:o.docsLink})]}),(0,s.jsx)(i,{code:c(location.origin)}),(0,s.jsx)(`p`,{className:`faint`,children:o.note}),(0,s.jsx)(`button`,{type:`button`,className:`btn`,onClick:()=>{e(),r(`keys`)},children:o.key})]})}function u({open:e,onClose:t}){return(0,a.useEffect)(()=>{if(!e)return;let n=e=>e.key===`Escape`&&t();return window.addEventListener(`keydown`,n),()=>window.removeEventListener(`keydown`,n)},[e,t]),(0,s.jsxs)(`aside`,{className:`drawer ask`,"aria-label":o.label,"aria-hidden":!e,inert:!e,children:[(0,s.jsxs)(`header`,{className:`ask-head`,children:[(0,s.jsx)(`h2`,{children:o.title}),(0,s.jsx)(`button`,{type:`button`,className:`btn icon ghost`,"aria-label":o.close,title:o.close,onClick:t,children:(0,s.jsx)(n,{size:16,"aria-hidden":`true`})})]}),(0,s.jsx)(l,{onClose:t})]})}export{u as AskPanel};