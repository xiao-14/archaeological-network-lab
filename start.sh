#!/bin/bash

osascript -e 'tell application "Terminal"
    do script "cd ~/Documents/软件/ordos_research_network/backend && source venv/bin/activate && uvicorn main:app --reload"
end tell'

osascript -e 'tell application "Terminal"
    do script "cd ~/Documents/软件/ordos_research_network/frontend && npm run dev"
end tell'

sleep 2
open http://localhost:5173
