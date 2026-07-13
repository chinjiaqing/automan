; NSIS 自定义钩子
; electron-builder 的运行检测只认主 exe（Automan.exe），
; 托盘常驻时 sidecar（automan-server.exe）仍占着 resources/ 下的文件，
; 升级/卸载前必须先清掉整棵进程树（/T 连带 python 等孙进程）。

!macro customInit
  nsExec::Exec 'taskkill /F /T /IM automan-server.exe'
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM automan-server.exe'
!macroend
