USER = nodered
HOST = home
NAME = $(shell basename $$PWD)

debug: sync
	ssh root@$(HOST) systemctl stop nodered
	ssh -t $(USER)@$(HOST) node_modules/node-red/bin/node-red-pi --max_old_space_size=256 -v

sync:
	rsync -a ./ $(USER)@$(HOST):$(NAME)
	# ssh $(USER)@$(HOST) "cd $(NAME) ; npm install"

restart:
	ssh root@$(HOST) systemctl restart nodered || ssh root@$(HOST) systemctl start nodered
