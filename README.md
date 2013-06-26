getsmart-js
===========

Middleware for Express.js, a Node.js framework. Compresses, minifies and concats JavaScript and CoffeeScript at runtime.


What it does
------------

getsmart-js intercepts GET requests for files ending in ".js". It checks to see if the modification date of the source file has changed since the last request, and updates the file if it has.

It optionally compresses and minifies the file (using uglify-js) – good for production.

If a request is made, and the source file is not found, getsmart-js looks for a folder with the same name as request (minus the '.js') and concatenates all files in that folder (including sub-folders).
eg. Request URL is "app.js", but "app.js" is not in the source folder, so getsmart-js looks for a folder named "app".


Installation
------------

Run	"npm install getsmart-js" to install the module.


Usgage
------

Use getsmart-js as a middleware for Express.js.

eg.
	app.configure(function(){
		app.use(require('getsmart-js')({
			compress: true,
			isProduction: false,
			src: __dirname
		}));
	};


Options
-------

compress Boolean (optional) Whether to compress & minify or not. Defaults to NODE_ENV == 'production'.

isProduction Boolean (optional) Will only check modification dates the first run if true. Defaults to NODE_ENV == 'production'.

src String (required) The source directory of the source JavaScript files.



Notes on Directories
--------------------

The file paths will include the request URL – so you must keep this in mind when setting the options.

eg. request URL = "/js/app.js", so getsmart will look for "app.js" inside the "js" folder in the source directory.
