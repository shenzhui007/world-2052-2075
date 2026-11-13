// Evaluate with the exact retained model and policy, not a future server release.
const fs=require('fs'), vm=require('vm');
const payload=JSON.parse(fs.readFileSync(0,'utf8'));
const context=vm.createContext({console,window:{FORECAST_ARCHIVE:payload.kind==='author'?{kind:'author'}:null}});
context.inputSnapshot=payload.inputs;
context.originalCached=payload.kind==='author'?payload.cachedResults:{};
vm.runInContext('let forecastOverrides=inputSnapshot;',context);
for(const name of ['forecast-model.js','forecast-engine.js','actual.js','history.js','forecast-input-policy.js','forecast-policy.js'])
  vm.runInContext(payload.assets[name],context,{filename:name});
vm.runInContext('forecastOverrides=Object.fromEntries(Object.entries(forecastOverrides).filter(([key,value])=>forecastInputAllowed(key)&&typeof value===\"number\"&&Number.isFinite(value)));',context);
const results=vm.runInContext(`(()=>{
  const all={historical:{},scenario:{}};
  for(const [kind,engine] of [['historical',historicalEngine()],['scenario',scenarioEngine()]]) {
    for(const [sheet,cells] of Object.entries(FORECAST_MODEL.cells)) {
      const keys=new Set([...Object.keys(cells),...Object.keys(FORECAST_MODEL.extension[sheet]||{})]);
      for(const key of Object.keys(HISTORY_VALUES))if(key.startsWith(sheet+'!'))keys.add(key.split('!')[1]);
      for(const addr of keys) {
        const key=sheet+'!'+addr;
        if(Object.hasOwn(originalCached,key)) {all[kind][key]=originalCached[key];continue;}
        try {const value=engine.cell(sheet,addr);all[kind][key]=typeof value==='number'&&!Number.isFinite(value)?null:value??null;}
        catch {all[kind][key]=null;}
      }
    }
  }
  return all;
})()`,context);
process.stdout.write(JSON.stringify(results));
