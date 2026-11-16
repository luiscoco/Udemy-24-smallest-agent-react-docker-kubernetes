import type {Server} from 'node:http';
export function gracefulShutdown(server:Server,abortAll:()=>void,exit:(code:number)=>void,graceMs=110000){
 let forced=false;
 const timer=setTimeout(()=>{forced=true;abortAll();server.closeAllConnections();setTimeout(()=>exit(1),1500).unref();},graceMs);timer.unref();
 server.close(()=>{if(!forced){clearTimeout(timer);exit(0);}});server.closeIdleConnections();
}
