import {apiFetch} from '../app/lib/api-client';
const networkFetch=window.fetch.bind(window);
window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const url=new URL(raw,window.location.origin);
  if(url.origin===window.location.origin && url.pathname.startsWith('/api/'))return apiFetch(url.pathname+url.search,init);
  return networkFetch(input,init);
};
document.addEventListener('click',(event)=>{
  const base=import.meta.env.BASE_URL.replace(/\/$/,'');
  const target=event.target as HTMLElement|null,link=target?.closest('a'),href=link?.getAttribute('href');
  if(!href||!href.startsWith('/')||href.startsWith(base+'/')||href.startsWith('/app/')||href.startsWith('/api/'))return;
  event.preventDefault();window.location.href=`${base}${href}`;
});
