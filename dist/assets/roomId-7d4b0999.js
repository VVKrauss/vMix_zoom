const r="abcdefghijklmnopqrstuvwxyz0123456789";function s(t=10){const o=new Uint8Array(t);crypto.getRandomValues(o);let e="";for(let n=0;n<t;n++)e+=r[o[n]%r.length];return e}export{s as n};
