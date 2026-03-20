local home_name = "Thuis"
local away_name = "Uit"
local score_tekst = "0 - 0"

util.json_watch("options.json", function(config)
    home_name = config.home_team or "Thuis"
    away_name = config.away_team or "Uit"
    score_tekst = config.score or "0 - 0"
end)

function node.render()
    gl.clear(0, 0, 0, 1) -- Scherm zwart
    
    -- We tekenen de namen wat kleiner en de score groot in het midden
    font:write(10, 10, home_name .. " vs " .. away_name, 30, 1, 1, 1, 1) 
    font:write(10, 50, score_tekst, 60, 1, 1, 0, 1) -- Score in het geel (1, 1, 0)
end