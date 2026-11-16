export async function authorizedFetch(url:string,options?:RequestInit){
 const response=await fetch(url,{...options,credentials:'same-origin'});
 if(response.status===401)throw new Error('The hosting gateway requires sign-in. Reload this page or contact the administrator.');
 return response;
}
