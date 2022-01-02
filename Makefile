.PHONY: debug install clean tidy

debug: install
	which node-red || $(MAKE) -B install
	node-red

install: /usr/local/lib/node_modules

/usr/local/lib/node_modules: package.json
	npm install
	npm install -g . node-red
	touch $@
	
clean:
	rm -rf /usr/local/lib/node_modules/node-red*

tidy: clean
	rm -rf $(HOME)/.node-red
