import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseLanguage,supportedLanguage,LanguagePreference} from '../src/language-preference.js';

test('first visit follows ordered supported browser preferences, falling back to English',()=>{
 for(const [input,expected]of [['en-US','en'],['ja-JP','ja'],['ko-KR','ko'],['fr-CA','fr'],['es-MX','es'],['zh','zh-CN'],['zh-SG','zh-CN'],['zh-TW','zh-TW'],['zh-HK','zh-TW'],['zh-MO','zh-TW'],['zh-Hant-CN','zh-TW'],['zh-Hans-HK','zh-CN']])assert.equal(supportedLanguage(input),expected,input);
 assert.equal(chooseLanguage(undefined,['de-DE','es-ES','ja-JP']),'es');
 assert.equal(chooseLanguage(undefined,['de','ru']),'en');assert.equal(chooseLanguage(undefined,[]),'en');
});
test('a saved language overrides later browser changes; invalid saved values are ignored',()=>{
 assert.equal(chooseLanguage('zh-TW',['ja-JP']),'zh-TW');
 assert.equal(chooseLanguage('en',['ja-JP']),'en');
 assert.equal(chooseLanguage('obsolete',['ko-KR']),'ko');
});
test('unavailable preference storage fails explicitly without affecting language selection',async()=>{
 const storage=new LanguagePreference(null);await assert.rejects(storage.read());await assert.rejects(storage.write('ko'));
 assert.equal(chooseLanguage(undefined,['ko-KR']),'ko');
});
