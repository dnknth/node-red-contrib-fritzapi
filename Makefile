USER = nodered
HOST = home
NAME = $(shell basename $$PWD)

debug: sync
	ssh -t $(HOST) /etc/init.d/node-red stop
	ssh -t $(HOST) su -l $(USER) -c '"/usr/bin/node-red --max_old_space_size=256 -v"'

sync:
	rsync *.* $(HOST):/usr/lib/node_modules/node-red-contrib-fritzapi

restart:
	ssh -t $(HOST) /etc/init.d/node-red restart

clean:
	rm -rf node_modules
