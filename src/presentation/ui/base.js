// Interface — outils de base : carte, raccourcis DOM, noms affichés, message éphémère.

import { arkenV9Map as map } from '../../map/arken-v9-map.js';

export const $ = selector => document.querySelector(selector), SVG = 'http://www.w3.org/2000/svg';
export const unitKeys = { infantry:'Infanterie', cavalry:'Cavalerie', armor:'Blindés', artillery:'Artillerie', warship:'Navires' };
export const buildingNames = { bank:'Banque', factory:'Usine', fort:'Forteresse', port:'Port' };
export const icons = { bank:'▦', factory:'⚒', fort:'▣', port:'⚓' };
export const nation = id => map.nations.find(n => n.id === id) || { short:'Nation inconnue', name:'Nation inconnue' };
export const province = id => map.provinces.find(p => p.id === id) || { name:'Province inconnue', markerAnchor:{x:0,y:0}, geometry:{points:[]} };
let toastTimer;
export const E = (tag, attrs={}) => { const node=document.createElementNS(SVG,tag); for(const [k,v] of Object.entries(attrs)) node.setAttribute(k,v); return node; };
export function toast(message) { const node=$('#toast'); node.textContent=message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('show'),4200); }
