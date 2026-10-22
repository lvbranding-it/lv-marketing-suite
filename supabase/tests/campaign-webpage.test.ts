import {afterEach,expect,it,vi} from 'vitest';
import handler from '../../api/campaign';
const token='00000000-0000-4000-8000-000000000003';
function response(){const headers:Record<string,string>={};return {headers,statusCode:0,body:'',setHeader(k:string,v:string){headers[k]=v;},end(v:string=''){this.body=v;}};}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('serves full HTML and social metadata with browser isolation and no cache',async()=>{
 vi.stubEnv('VITE_SUPABASE_URL','https://backend.example.com');
 const fetcher=vi.fn().mockResolvedValue(Response.json({html:'<!DOCTYPE html><title>News</title><meta property="og:title" content="News"><p>Email</p>'}));
 vi.stubGlobal('fetch',fetcher);const res=response();
 await handler({method:'GET',query:{token}} as any,res as any);
 expect(res.statusCode).toBe(200);expect(res.body).toContain('og:title');
 expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
 expect(res.headers['Cache-Control']).toBe('no-store');
 expect(res.headers['Content-Security-Policy']).toContain('sandbox');
 expect(res.headers['Content-Security-Policy']).not.toContain('allow-scripts');
 expect(res.headers['Content-Security-Policy']).not.toContain('allow-same-origin');
 expect(fetcher.mock.calls[0][0]).toBe(`https://backend.example.com/functions/v1/campaign-share?token=${token}`);
});
it('returns 404 for disabled or unknown links, not the app login page',async()=>{
 vi.stubEnv('VITE_SUPABASE_URL','https://backend.example.com');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('Not found',{status:404})));
 const res=response();await handler({method:'GET',query:{token}} as any,res as any);
 expect(res.statusCode).toBe(404);expect(res.body).toBe('This email is not available.');
});
it('rejects malformed tokens without backend requests',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res=response();
 await handler({method:'GET',query:{token:'../../secret'}} as any,res as any);
 expect(res.statusCode).toBe(404);expect(fetcher).not.toHaveBeenCalled();
});
it('keeps backend failures retryable rather than implying a disabled link',async()=>{
 vi.stubEnv('VITE_SUPABASE_URL','https://backend.example.com');
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('timeout')));
 const res=response();await handler({method:'GET',query:{token}} as any,res as any);expect(res.statusCode).toBe(503);
});
