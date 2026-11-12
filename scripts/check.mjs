import {readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

function check(directory){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const path=directory+'/'+entry.name;
    if(entry.isDirectory())check(path);
    else if(/\.m?js$/.test(entry.name))execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
  }
}
check('src');
check('tests');
