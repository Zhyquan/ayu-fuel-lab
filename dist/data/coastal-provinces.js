import { provinces } from './provinces.js';
export const coastalProvinces = ['福建','浙江','山东','广东','辽宁','海南','江苏','河北','天津','上海','广西'].map(name => provinces.find(province => province.name === name));
