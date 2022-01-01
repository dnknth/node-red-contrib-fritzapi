HOST = home
USER = nodered
NAME = $(shell basename $$PWD)

debug: sync
	ssh -t $(HOST) systemctl stop node-red
	ssh -t $(HOST) su -l $(USER) -c '"node_modules/.bin/node-red -u ~nodered -v"'

sync:
	rsync -v --modify-window=1 *.* $(USER)@$(HOST):node_modules/$(NAME)

restart:
	ssh -t $(HOST) systemctl restart node-red

clean:
	rm -rf node_modules
