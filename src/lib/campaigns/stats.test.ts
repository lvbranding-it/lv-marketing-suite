import {expect,it} from 'vitest';
import {campaignRate} from './stats';
it('shows small rates without rounding them to zero',()=>expect(campaignRate(1,1000)).toBe('0.1%'));
it('handles no sends and bounds inconsistent historic counts',()=>{
 expect(campaignRate(0,0)).toBe('—'); expect(campaignRate(200,100)).toBe('100%');
});
