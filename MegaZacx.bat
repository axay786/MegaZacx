@echo off
title MegaZacx
cd /d "%~dp0"
start "" "%~dp0node_modules\.bin\electron.cmd" .
exit
