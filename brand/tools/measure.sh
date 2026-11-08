#!/bin/bash
# prints the document height of an html file
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --user-data-dir=/Users/abd/repos/claura-brand/tools/.chrome --virtual-time-budget=4000 --window-size=1880,1000 --dump-dom "file://$1" 2>/dev/null | grep -o 'data-h="[0-9]*"' | head -1
