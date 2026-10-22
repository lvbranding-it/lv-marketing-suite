import {describe,expect,it} from 'vitest';
import {renderPublicEmail} from './public';
import {wrapHtml} from './template';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifySendGridSignature,isCampaignEvent} from './webhook';

describe('public email',()=>{
 it('uses the sent email layout, generic merge values and no recipient unsubscribe link',()=>{
  const html=renderPublicEmail({subject:'Hello {{first_name}}',preview_text:'News',body_html:'<p>Hello {{first_name}} {{email}}</p><a href="https://example.com">Read more</a>'});
  expect(html).toContain('<p>Hello there </p>');
  expect(html).toContain('https://example.com');
  expect(html).toContain('og:title');
  expect(html).not.toContain('Unsubscribe');
  expect(html).not.toContain('{{');
  expect(html).toContain('padding:36px 32px');
  expect(wrapHtml('Body','https://example.com/unsubscribe?rid=test')).toContain('Unsubscribe');
 });
 it('escapes social preview metadata',()=>{
  const html=renderPublicEmail({subject:'"><script>alert(1)</script>',preview_text:null,body_html:'<p>Email</p>'});
  expect(html).toContain('&lt;script&gt;');
 });
});
describe('SendGrid verification',()=>{
 it('verifies the exact signed request and rejects altered data',()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const key=publicKey.export({format:'der',type:'spki'}).toString('base64');
  const payload='[{"event":"open"}]', timestamp='1792685000';
  const signature=sign('sha256',Buffer.from(timestamp+payload),privateKey).toString('base64');
  expect(verifySendGridSignature(payload,timestamp,signature,key)).toBe(true);
  expect(verifySendGridSignature('[]',timestamp,signature,key)).toBe(false);
  expect(verifySendGridSignature(payload,null,null,key)).toBe(false);
 });
 it('ignores malformed and unrelated events',()=>{
  expect(isCampaignEvent(null)).toBe(false);
  expect(isCampaignEvent({event:'open',recipient_id:'bad'})).toBe(false);
 });
});
