import metadata from '../../package.json';

export const appVersion=metadata.version;
export const releaseRepository={owner:'elorenzog',repo:'lumen',url:'https://github.com/elorenzog/lumen',releases:'https://github.com/elorenzog/lumen/releases/latest'} as const;
export const developers=[{name:'Eliezer Lorenzo',role:'Desarrollo y Diseño',initials:'EL',github:'elorenzog'},{name:'Ezequiel Sierra',role:'Desarrollo',initials:'ES',github:'xlCyanz'}] as const;
