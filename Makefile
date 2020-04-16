HOST = home
USER = nodered
NAME = $(shell basename $$PWD)

debug: sync
	ssh -t $(HOST) systemctl stop node-red
	ssh -t $(HOST) su -l $(USER) -c '"/usr/local/bin/node-red-pi --max_old_space_size=256 -v"'

sync:
	rsync *.* $(HOST):/usr/local/lib/node_modules/$(NAME)

restart:
	ssh -t $(HOST) systemctl restart node-red

clean:
	rm -rf node_modules
