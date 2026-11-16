export function resourceAddress(value){
  try{return new URL(value).href;}
  catch(error){if(error instanceof TypeError)return null;throw error;}
}

export function diagnosticReplacer(_key,value){
  if(typeof value!=='string')return value;
  return value.replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/[^\s"'<>\\)]+/g,match=>{
    const address=new URL(match);
    const parts=address.pathname.split('/').filter(Boolean);
    if(parts.length>1&&/^[a-f0-9]{32,}$/i.test(parts[0]))parts[0]='<token>';
    return address.origin+'/'+parts.join('/');
  });
}

export function classifyConsoleErrors({consoleErrors,responses,knownHymns}){
  const expectedCancellationResponses=responses.filter(response=>{
    const revision=knownHymns.get(response.url);
    const active=response.native?.activeMedia;
    return response.status===404&&response.resourceType==='media'&&revision!==undefined
      &&typeof response.native?.revision==='number'&&response.native.revision>revision
      &&(active===null||typeof active==='string'&&active!==response.url);
  });
  const unexpected=consoleErrors.filter(error=>{
    if(!/Failed to load resource:.*404/.test(error.message)||!error.url)return true;
    return !expectedCancellationResponses.some(response=>response.url===error.url&&response.page===error.page);
  });
  return {expectedCancellationResponses,unexpected};
}
