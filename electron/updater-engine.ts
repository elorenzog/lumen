import { autoUpdater } from 'electron-updater';
import { releaseRepository } from '../src/shared/app-info';
import type { UpdateEngine } from './updates';

export function githubUpdateEngine():UpdateEngine{
  autoUpdater.autoDownload=false;
  autoUpdater.autoInstallOnAppQuit=false;
  autoUpdater.allowDowngrade=false;
  autoUpdater.allowPrerelease=false;
  autoUpdater.disableWebInstaller=true;
  autoUpdater.setFeedURL({provider:'github',owner:releaseRepository.owner,repo:releaseRepository.repo,private:false});
  return {listen:(event,listener)=>{autoUpdater.on(event,listener);},check:()=>autoUpdater.checkForUpdates(),download:()=>autoUpdater.downloadUpdate(),install:()=>autoUpdater.quitAndInstall(false,true)};
}
