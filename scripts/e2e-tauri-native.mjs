export async function invoke(page,action){
  return page.evaluate(async action=>{const result=await window.lumen.invoke(action);if(!result.ok)throw new Error(result.error);return result.data;},action);
}

export async function snapshot(page){return invoke(page,{type:'snapshot'});}

export async function waitForNative(page,expected){
  return page.evaluate(expected=>new Promise((resolve,reject)=>{
    const matches=snapshot=>{
      switch(expected.kind){
        case 'bible':return snapshot.bibles.some(bible=>bible.id===expected.id);
        case 'hymn-count':return snapshot.hymns.length===expected.count;
        case 'track':return snapshot.output.slide.kind==='hymn'&&snapshot.output.slide.track===expected.track;
        case 'connected':return snapshot.output.connected===expected.value;
        default:throw new Error(`Unknown native condition: ${expected.kind}`);
      }
    };
    const unsubscribe=window.lumen.subscribe(receive);
    const timeout=setTimeout(()=>finish(new Error(`Native condition was not reached: ${JSON.stringify(expected)}`)),60000);
    function finish(error,value){clearTimeout(timeout);unsubscribe();if(error)reject(error);else resolve(value);}
    function receive(value){if(matches(value))finish(null,value);}
    window.lumen.invoke({type:'snapshot'}).then(response=>{
      if(response.ok)receive(response.data);else finish(new Error(response.error));
    },error=>finish(error));
  }),expected);
}
