local api_base_url = "https://ipod-2to6magyna-uc.a.run.app/"
local version = "2.1"

local width, height = term.getSize()
local tab = 1

local waiting_for_input = false
local last_search = nil
local last_search_url = nil
local search_results = nil
local search_error = false
local in_search_result = false
local clicked_result = nil

local playing = false
local queue = {}
local now_playing = nil
local looping = 0
local volume = 1.5

local playing_id = nil
local last_download_url = nil
local playing_status = 0
local is_loading = false
local is_error = false;

local player_handle = nil
local start = nil
local pcm = nil
local size = nil
local decoder = require "cc.audio.dfpwm".make_decoder()
local needs_next_chunk = 0
local buffer

local speakers = { peripheral.find("speaker") }
if #speakers == 0 then
	error("No speakers attached. You need to connect a speaker to this computer. If this is an Advanced Noisy Pocket Computer, then this is a bug, and you should try restarting your Minecraft game.", 0)
end

function redrawScreen()
	if waiting_for_input then
		return
	end

	term.setCursorBlink(false)  -- Make sure cursor is off when redrawing
	-- Clear the screen
	term.setBackgroundColor(colors.black)
	term.clear()

	--Draw the three top tabs
	term.setCursorPos(1,1)
	term.setBackgroundColor(colors.gray)
	term.clearLine()
	
	tabs = {" Now Playing ", " Search "}
	
	for i=1,#tabs,1 do
		if tab == i then
			term.setTextColor(colors.black)
			term.setBackgroundColor(colors.white)
		else
			term.setTextColor(colors.white)
			term.setBackgroundColor(colors.gray)
		end
		
		term.setCursorPos((math.floor((width/#tabs)*(i-0.5)))-math.ceil(#tabs[i]/2)+1, 1)
		term.write(tabs[i])
	end

	if tab == 1 then
		drawNowPlaying()
	elseif tab == 2 then
		drawSearch()
	end
end

function drawNowPlaying()
	if now_playing ~= nil then
		term.setBackgroundColor(colors.black)
		term.setTextColor(colors.white)
		term.setCursorPos(2,3)
		term.write(now_playing.name)
		term.setTextColor(colors.lightGray)
		term.setCursorPos(2,4)
		term.write(now_playing.artist)
	else
		term.setBackgroundColor(colors.black)
		term.setTextColor(colors.lightGray)
		term.setCursorPos(2,3)
		term.write("Not playing")
	end

	if is_loading == true then
		term.setTextColor(colors.gray)
		term.setBackgroundColor(colors.black)
		term.setCursorPos(2,5)
		term.write("Loading...")
	elseif is_error == true then
		term.setTextColor(colors.red)
		term.setBackgroundColor(colors.black)
		term.setCursorPos(2,5)
		term.write("Network error")
	end

	term.setTextColor(colors.white)
	term.setBackgroundColor(colors.gray)

	if playing then
		term.setCursorPos(2, 6)
		term.write(" Stop ")
	else
		if now_playing ~= nil or #queue > 0 then
			term.setTextColor(colors.white)
			term.setBackgroundColor(colors.gray)
		else
			term.setTextColor(colors.lightGray)
			term.setBackgroundColor(colors.gray)
		end
		term.setCursorPos(2, 6)
		term.write(" Play ")
	end

	if now_playing ~= nil or #queue > 0 then
		term.setTextColor(colors.white)
		term.setBackgroundColor(colors.gray)
	else
		term.setTextColor(colors.lightGray)
		term.setBackgroundColor(colors.gray)
	end
	term.setCursorPos(2 + 7, 6)
	term.write(" Skip ")

	if looping ~= 0 then
		term.setTextColor(colors.black)
		term.setBackgroundColor(colors.white)
	else
		term.setTextColor(colors.white)
		term.setBackgroundColor(colors.gray)
	end
	term.setCursorPos(2 + 7 + 7, 6)
	if looping == 0 then
		term.write(" Loop Off ")
	elseif looping == 1 then
		term.write(" Loop Queue ")
	else
		term.write(" Loop Song ")
	end

	term.setCursorPos(2,8)
	paintutils.drawBox(2,8,25,8,colors.gray)
	local width = math.floor(24 * (volume / 3) + 0.5)-1
	if not (width == -1) then
		paintutils.drawBox(2,8,2+width,8,colors.white)
	end
	if volume < 0.6 then
		term.setCursorPos(2+width+2,8)
		term.setBackgroundColor(colors.gray)
		term.setTextColor(colors.white)
	else
		term.setCursorPos(2+width-3-(volume == 3 and 1 or 0),8)
		term.setBackgroundColor(colors.white)
		term.setTextColor(colors.black)
	end
	term.write(math.floor(100 * (volume / 3) + 0.5) .. "%")

	if #queue > 0 then
		term.setBackgroundColor(colors.black)
		for i=1,#queue do
			term.setTextColor(colors.white)
			term.setCursorPos(2,10 + (i-1)*2)
			term.write(queue[i].name)
			term.setTextColor(colors.lightGray)
			term.setCursorPos(2,11 + (i-1)*2)
			term.write(queue[i].artist)
		end
	end
end

function drawSearch()
	-- Search bar
	paintutils.drawFilledBox(2,3,width-1,5,colors.lightGray)
	term.setBackgroundColor(colors.lightGray)
	term.setCursorPos(3,4)
	term.setTextColor(colors.black)
	term.write(last_search or "Search...")

	--Search results
	if search_results ~= nil then
		term.setBackgroundColor(colors.black)
		for i=1,#search_results do
			term.setTextColor(colors.white)
			term.setCursorPos(2,7 + (i-1)*2)
			term.write(search_results[i].name)
			term.setTextColor(colors.lightGray)
			term.setCursorPos(2,8 + (i-1)*2)
			term.write(search_results[i].artist)
		end
	else
		term.setCursorPos(2,7)
		term.setBackgroundColor(colors.black)
		if search_error == true then
			term.setTextColor(colors.red)
			term.write("Network error")
		elseif last_search_url ~= nil then
			term.setTextColor(colors.lightGray)
			term.write("Searching...")
		else
			term.setCursorPos(1,7)
			term.setTextColor(colors.lightGray)
			print("Tip: You can paste YouTube video or playlist links.")
		end
	end

	--fullscreen song options
	if in_search_result == true then
		term.setBackgroundColor(colors.black)
		term.clear()
		term.setCursorPos(2,2)
		term.setTextColor(colors.white)
		term.write(search_results[clicked_result].name)
		term.setCursorPos(2,3)
		term.setTextColor(colors.lightGray)
		term.write(search_results[clicked_result].artist)

		term.setBackgroundColor(colors.gray)
		term.setTextColor(colors.white)

		term.setCursorPos(2,6)
		term.clearLine()
		term.write("Play now")

		term.setCursorPos(2,8)
		term.clearLine()
		term.write("Play next")

		term.setCursorPos(2,10)
		term.clearLine()
		term.write("Add to queue")

		term.setCursorPos(2,13)
		term.clearLine()
		term.write("Cancel")
	end
end

function uiLoop()
	redrawScreen()

	while true do
		if waiting_for_input then
			parallel.waitForAny(
				function()
					term.setCursorPos(3,4)
					term.setBackgroundColor(colors.white)
					term.setTextColor(colors.black)
					local input = read()

					if string.len(input) > 0 then
						last_search = input
						last_search_url = api_base_url .. "?v=" .. version .. "&search=" .. textutils.urlEncode(input)
						http.request(last_search_url)
						search_results = nil
						search_error = false
					else
						last_search = nil
						last_search_url = nil
						search_results = nil
						search_error = false
					end

					waiting_for_input = false
					os.queueEvent("redraw_screen")
				end,
				function()
					while waiting_for_input do
						local event, button, x, y = os.pullEvent("mouse_click")
						if y < 3 or y > 5 or x < 2 or x > width-1 then
							waiting_for_input = false
							os.queueEvent("redraw_screen")
							break
						end
					end
				end
			)
		else
			parallel.waitForAny(
				function()
					local event, button, x, y = os.pullEvent("mouse_click")

					if button == 1 then
						-- Tabs
						if in_search_result == false then
							if y == 1 then
								if x < width/2 then
									tab = 1
								else
									tab = 2
								end
								redrawScreen()
							end
						end
						
						if tab == 2 and in_search_result == false then
							-- Search box click
							if y >= 3 and y <= 5 and x >= 1 and x <= width-1 then
								paintutils.drawFilledBox(2,3,width-1,5,colors.white)
								term.setBackgroundColor(colors.white)
								waiting_for_input = true
							end
		
							-- Search result click
							if search_results then
								for i=1,#search_results do
									if y == 7 + (i-1)*2 or y == 8 + (i-1)*2 then
										term.setBackgroundColor(colors.white)
										term.setTextColor(colors.black)
										term.setCursorPos(2,7 + (i-1)*2)
										term.clearLine()
										term.write(search_results[i].name)
										term.setTextColor(colors.gray)
										term.setCursorPos(2,8 + (i-1)*2)
										term.clearLine()
										term.write(search_results[i].artist)
										sleep(0.2)
										in_search_result = true
										clicked_result = i
										redrawScreen()
									end
								end
							end
						elseif tab == 2 and in_search_result == true then
							-- Search result menu clicks
		
							term.setBackgroundColor(colors.white)
							term.setTextColor(colors.black)
		
							if y == 6 then
								term.setCursorPos(2,6)
								term.clearLine()
								term.write("Play now")
								sleep(0.2)
								in_search_result = false
								for _, speaker in ipairs(speakers) do
									speaker.stop()
									os.queueEvent("playback_stopped")
								end
								playing = true
								is_error = false
								playing_id = nil
								if search_results[clicked_result].type == "playlist" then
									now_playing = search_results[clicked_result].playlist_items[1]
									queue = {}
									if #search_results[clicked_result].playlist_items > 1 then
										for i=2, #search_results[clicked_result].playlist_items do
											table.insert(queue, search_results[clicked_result].playlist_items[i])
										end
									end
								else
									now_playing = search_results[clicked_result]
								end
								os.queueEvent("audio_update")
							end
		
							if y == 8 then
								term.setCursorPos(2,8)
								term.clearLine()
								term.write("Play next")
								sleep(0.2)
								in_search_result = false
								if search_results[clicked_result].type == "playlist" then
									for i = #search_results[clicked_result].playlist_items, 1, -1 do
										table.insert(queue, 1, search_results[clicked_result].playlist_items[i])
									end
								else
									table.insert(queue, 1, search_results[clicked_result])
								end
								os.queueEvent("audio_update")
							end
		
							if y == 10 then
								term.setCursorPos(2,10)
								term.clearLine()
								term.write("Add to queue")
								sleep(0.2)
								in_search_result = false
								if search_results[clicked_result].type == "playlist" then
									for i = 1, #search_results[clicked_result].playlist_items do
										table.insert(queue, search_results[clicked_result].playlist_items[i])
									end
								else
									table.insert(queue, search_results[clicked_result])
								end
								os.queueEvent("audio_update")
							end
		
							if y == 13 then
								term.setCursorPos(2,13)
								term.clearLine()
								term.write("Cancel")
								sleep(0.2)
								in_search_result = false
							end
		
							redrawScreen()
						elseif tab == 1 and in_search_result == false then
							-- Now playing tab clicks
		
							if y == 6 then
								-- Play/stop button
								if x >= 2 and x < 2 + 6 then
									if playing or now_playing ~= nil or #queue > 0 then
										term.setBackgroundColor(colors.white)
										term.setTextColor(colors.black)
										term.setCursorPos(2, 6)
										if playing then
											term.write(" Stop ")
										else 
											term.write(" Play ")
										end
										sleep(0.2)
									end
									if playing then
										playing = false
										for _, speaker in ipairs(speakers) do
											speaker.stop()
											os.queueEvent("playback_stopped")
										end
										playing_id = nil
										is_loading = false
										is_error = false
										os.queueEvent("audio_update")
									elseif now_playing ~= nil then
										playing_id = nil
										playing = true
										is_error = false
										os.queueEvent("audio_update")
									elseif #queue > 0 then
										now_playing = queue[1]
										table.remove(queue, 1)
										playing_id = nil
										playing = true
										is_error = false
										os.queueEvent("audio_update")
									end
								end
		
								-- Skip button
								if x >= 2 + 7 and x < 2 + 7 + 6 then
									if now_playing ~= nil or #queue > 0 then
										term.setBackgroundColor(colors.white)
										term.setTextColor(colors.black)
										term.setCursorPos(2 + 7, 6)
										term.write(" Skip ")
										sleep(0.2)
		
										is_error = false
										if playing then
											for _, speaker in ipairs(speakers) do
												speaker.stop()
												os.queueEvent("playback_stopped")
											end
										end
										if #queue > 0 then
											if looping == 1 then
												table.insert(queue, now_playing)
											end
											now_playing = queue[1]
											table.remove(queue, 1)
											playing_id = nil
										else
											now_playing = nil
											playing = false
											is_loading = false
											is_error = false
											playing_id = nil
										end
										os.queueEvent("audio_update")
									end
								end
		
								-- Loop button
								if x >= 2 + 7 + 7 and x < 2 + 7 + 7 + 12 then
									if looping == 0 then
										looping = 1
									elseif looping == 1 then
										looping = 2
									else
										looping = 0
									end
								end
							end

							if y == 8 then
								-- Volume slider
								if x >= 1 and x < 2 + 24 then
									volume = (x - 1) / 24 * 3

									-- for _, speaker in ipairs(speakers) do
									-- 	speaker.stop()
									-- 	os.queueEvent("playback_stopped")
									-- end
									-- playing_id = nil
									-- os.queueEvent("audio_update")
								end
							end

							redrawScreen()
						end
					end
				end,
				function()
					local event, button, x, y = os.pullEvent("mouse_drag")

					if button == 1 then

						if tab == 1 and in_search_result == false then

							if y >= 7 and y <= 9 then
								-- Volume slider
								if x >= 1 and x < 2 + 24 then
									volume = (x - 1) / 24 * 3

									-- for _, speaker in ipairs(speakers) do
									-- 	speaker.stop()
									-- 	os.queueEvent("playback_stopped")
									-- end
									-- playing_id = nil
									-- os.queueEvent("audio_update")
								end
							end

							redrawScreen()
						end
					end
				end,
				function()
					local event = os.pullEvent("redraw_screen")

					redrawScreen()
				end
			)
		end
	end
end

function audioLoop()
	while true do

		-- AUDIO
		if playing and now_playing then
			local thisnowplayingid = now_playing.id
			if playing_id ~= thisnowplayingid then
				playing_id = thisnowplayingid
				last_download_url = api_base_url .. "?v=" .. version .. "&id=" .. textutils.urlEncode(playing_id)
				playing_status = 0
				needs_next_chunk = 1

				http.request({url = last_download_url, binary = true})
				is_loading = true

				os.queueEvent("redraw_screen")
				os.queueEvent("audio_update")
			elseif playing_status == 1 and needs_next_chunk == 1 then

				while true do
					local chunk = player_handle.read(size)
					if not chunk then
						if looping == 2 or (looping == 1 and #queue == 0) then
							playing_id = nil
						elseif looping == 1 and #queue > 0 then
							table.insert(queue, now_playing)
							now_playing = queue[1]
							table.remove(queue, 1)
							playing_id = nil
						else
							if #queue > 0 then
								now_playing = queue[1]
								table.remove(queue, 1)
								playing_id = nil
							else
								now_playing = nil
								playing = false
								playing_id = nil
								is_loading = false
								is_error = false
							end
						end

						os.queueEvent("redraw_screen")

						player_handle.close()
						needs_next_chunk = 0
						break
					else
						if start then
							chunk, start = start .. chunk, nil
							size = size + 4
						end
				
						buffer = decoder(chunk)
						
						local fn = {}
						for i, speaker in ipairs(speakers) do 
							fn[i] = function()
								local name = peripheral.getName(speaker)
								if #speakers > 1 then
									if speaker.playAudio(buffer, volume) then
										parallel.waitForAny(
											function()
												repeat until select(2, os.pullEvent("speaker_audio_empty")) == name
											end,
											function()
												local event = os.pullEvent("playback_stopped")
												return
											end
										)
										if not playing or playing_id ~= thisnowplayingid then
											return
										end
									end
								else
									while not speaker.playAudio(buffer, volume) do
										parallel.waitForAny(
											function()
												repeat until select(2, os.pullEvent("speaker_audio_empty")) == name
											end,
											function()
												local event = os.pullEvent("playback_stopped")
												return
											end
										)
										if not playing or playing_id ~= thisnowplayingid then
											return
										end
									end
								end
								if not playing or playing_id ~= thisnowplayingid then
									return
								end
							end
						end
						
						local ok, err = pcall(parallel.waitForAll, table.unpack(fn))
						if not ok then
							needs_next_chunk = 2
							is_error = true
							break
						end
						
						-- If we're not playing anymore, exit the chunk processing loop
						if not playing or playing_id ~= thisnowplayingid then
							break
						end
					end
				end
				os.queueEvent("audio_update")
			end
		end

		os.pullEvent("audio_update")
	end
end

function httpLoop()
	while true do
		parallel.waitForAny(
			function()
				local event, url, handle = os.pullEvent("http_success")

				if url == last_search_url then
					search_results = textutils.unserialiseJSON(handle.readAll())
					os.queueEvent("redraw_screen")
				end
				if url == last_download_url then
					is_loading = false
					player_handle = handle
					start = handle.read(4)
					size = 16 * 1024 - 4
					playing_status = 1
					os.queueEvent("redraw_screen")
					os.queueEvent("audio_update")
				end
			end,
			function()
				local event, url = os.pullEvent("http_failure")	

				if url == last_search_url then
					search_error = true
					os.queueEvent("redraw_screen")
				end
				if url == last_download_url then
					is_loading = false
					is_error = true
					playing = false
					playing_id = nil
					os.queueEvent("redraw_screen")
					os.queueEvent("audio_update")
				end
			end
		)
	end
end

parallel.waitForAny(uiLoop, audioLoop, httpLoop)