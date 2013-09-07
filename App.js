Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    maxHeight : 50,
    
    items : [ { xtype : "container", itemId : "10" }
    
    ],
    
    listeners : { render : function() {
        console.log("rendered");
    }},
    
    launch: function() {
        //Write app code here
        this._createStore();
        
    },
    _createStore : function() {
        var that = this;
        
        // {find:{ _ProjectHierarchy : { "$in": 380227538 } , 
        //     _ValidTo : "9999-01-01T00:00:00Z", 
        //     _TypeHierarchy : { "$in" : ["HierarchicalRequirement"]}, 
        //     "$or" : [ {"Predecessors" : {"$exists" : true }} , {"Successors" : { "$exists" : true }}  ] },
        // fields : ["ObjectID","_TypeHierarchy","Predecessors","Successors"],
        // hydrate: ["_TypeHierarchy"]
        // }

        // filter for just projects in scope and for current snapshots        
        var filter = Ext.create('Rally.data.lookback.QueryFilter', {
                property: '_ProjectHierarchy',
                operator : 'in',
                value : [that.getContext().getProject().ObjectID] // 5970178727
            }
        );
        filter = filter.and( Ext.create('Rally.data.lookback.QueryFilter', {
                property: "_ValidTo",
                operator : "=",
                value : "9999-01-01T00:00:00Z"
            }
            )
        );

        // filter only if predecessors or successors are set
        var depFilter = Ext.create('Rally.data.lookback.QueryFilter', {
            property: 'Predecessors',
            operator: 'exists',
            value : true
        });
        
        depFilter = depFilter.or( Ext.create('Rally.data.lookback.QueryFilter', {
                property: 'Successors',
                operator: 'exists',
                value : true
            })
        );
        
        filter = filter.and(depFilter);

        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad: true,
            limit : "Infinity",
            listeners: {
                load: function(dataStore, records) {
                    console.log("records:",records.length);
                    this._createGraph(records);
                },
                scope: that
            },
            fetch: ['ObjectID','_UnformattedID', '_TypeHierarchy', 'Predecessors','Successors','Blocked','ScheduleState'],
            hydrate: ['_TypeHierarchy','ScheduleState'],
            filters : [filter]
        });
    },
    
    _fill : function (snapshots, snapshot) {
            var preds = snapshot.get("Predecessors");
            var that = this;
            if (_.isArray(preds)) {
                var children = _.map(preds, function(pred) { return _.find( snapshots, function(snap) { 
                    return pred == snap.get("ObjectID");
                } ) })
                _.each(children, function(child) { that._fill(snapshots,child); });
                snapshot.children = children;
            }
    },
    
    _createGraph : function( snapshots ) {
        
        var that = this;
        var p = _.filter(snapshots,function(rec) { return _.isArray(rec.get("Predecessors"));});
        var s = _.filter(snapshots,function(rec) { return _.isArray(rec.get("Successors"));});
        console.log("p",p.length);
        console.log("s",s.length);

        // create the set of node elements
        var nodes = _.map( snapshots, function(snap) {
            if (_.isArray(snap.get("Predecessors"))||_.isArray(snap.get("Successors"))) {
                return { id : snap.get("ObjectID"), snapshot : snap };
            } else {
                return null;
            }
        });
        nodes = _.compact(nodes);

        // this._forceDirectedGraph(nodes,links);
        this._findMissingSnapshots(nodes);
    },
    
    _findMissingSnapshots : function(nodes) {
        
        var missing = [];        
        var that = this;
        _.each(nodes, function(node) {
            _.each(node.snapshot.get("Predecessors"), function(pred) {
                var target = _.find(nodes,function(node) { return node.id == pred;});
                // may be undefined if pred is out of project scope, need to figure out how to deal with that
                if (!_.isUndefined(target)) {
                    missing.push(pred);
                }
            });
        });
        console.log("missing:",missing.length);

        // filter for just projects in scope and for current snapshots        
        var filter = Ext.create('Rally.data.lookback.QueryFilter', {
                property: 'ObjectID',
                operator : 'in',
                value : missing
            }
        );
        filter = filter.and( Ext.create('Rally.data.lookback.QueryFilter', {
                property: "_ValidTo",
                operator : "=",
                value : "9999-01-01T00:00:00Z"
            }
            )
        );

        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad: true,
            limit : "Infinity",
            listeners: {
                load: function(dataStore, records) {
                    console.log("missing records found:",records.length);
                    nodes.concat( _.map(records), function(rec) {
                        return { id : rec.get("ObjectID"), snapshot : rec }; 
                    });
                    // create the links
                    var links = [];
                    var stillmissing = 0;
                    _.each(nodes, function(node) {
                        _.each(node.snapshot.get("Predecessors"), function(pred) {
                            var target = _.find(nodes,function(node) { return node.id == pred;});
                            // may be undefined if pred is out of project scope, need to figure out how to deal with that
                            if (!_.isUndefined(target)) {
                                links.push( 
                                    { source : node, target : target  }
                                );
                            } else {
                                console.log("Missing pred:",pred,node.snapshot.get("_UnformattedID"),stillmissing++);
                            }
                        });
                    });

                    this._forceDirectedGraph(nodes,links); 
                },
                scope: that
            },
            fetch: ['ObjectID','_UnformattedID', '_TypeHierarchy', 'Predecessors','Successors','Blocked','ScheduleState'],
            hydrate: ['_TypeHierarchy','ScheduleState'],
            filters : [filter]
        });
    },
    
    _forceDirectedGraph : function(nodes,links) {

        var width = 1200,
            height = 600;
        
        var color = d3.scale.category20();

        var svg = d3.select("body").append("svg")
            .attr("width", width)
            .attr("height", height)
            .on('mousemove', this.myMouseMoveFunction)
            
        var div = d3.select("body")
            .append("div")
            .html("Some text")
            .classed("infobox",true);

        // define arrow markers for graph links
        svg.append('svg:defs').append('svg:marker')
            .attr('id', 'end-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 6)
            .attr('markerWidth', 5)
            .attr('markerHeight', 5)
            .attr('orient', 'auto')
          .append('svg:path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#000');

        svg.append('svg:defs').append('svg:marker')
            .attr('id', 'start-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 4)
            .attr('markerWidth', 3)
            .attr('markerHeight', 3)
            .attr('orient', 'auto')
          .append('svg:path')
            .attr('d', 'M10,-5L0,0L10,5')
            .attr('fill', '#000');

        var force = d3.layout.force()
            .charge(-60)
            .linkDistance(30)
            .size([width, height])
            .nodes(nodes)
            .links(links)
            .start();

        // handles to link and node element groups
        var path = svg.append('svg:g').selectAll('path')
            .data(links)
            .enter()
            .append('svg:path')
            .attr('class', 'link')
            .attr('marker-end', 'url(#end-arrow)');

        // .style('marker-start', function(d) { return d.left ? 'url(#start-arrow)' : ''; })
        var circle = svg.append('svg:g').selectAll('g')
            .data(nodes, function(d) { return d.id; })
            .enter()
            .append('svg:g')
            .append('svg:circle')
                .attr('class', 'node')
                .attr('r', 5)
                .style("fill", function(d) { return d.snapshot.get("ScheduleState") == "Accepted" ? "Green" : "Black"; })            
                .call(force.drag)
                .on("mouseover", this.myMouseOverFunction)
		    	.on("mouseout", this.myMouseOutFunction);  	

        force.on("tick", function() {
            path.attr('d', function(d) {
            var deltaX = d.target.x - d.source.x,
                deltaY = d.target.y - d.source.y,
                dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY),
                normX = deltaX / dist,
                normY = deltaY / dist,
                sourcePadding = 0, // d.left ? 17 : 12,
                targetPadding = 8, // d.right ? 17 : 12,
                sourceX = d.source.x + (sourcePadding * normX),
                sourceY = d.source.y + (sourcePadding * normY),
                targetX = d.target.x - (targetPadding * normX),
                targetY = d.target.y - (targetPadding * normY);
            return 'M' + sourceX + ',' + sourceY + 'L' + targetX + ',' + targetY;
            });

            circle.attr('transform', function(d) {
                return 'translate(' + d.x + ',' + d.y + ')';
            });
        });
    },
    
    // this will be ran whenever we mouse over a circle
	myMouseOverFunction : function() {
    	var circle = d3.select(this);
    	circle.attr("fill", "red" );
    	// show infobox div on mouseover.
    	// block means sorta "render on the page" whereas none would mean "don't render at all"
    	d3.select(".infobox").style("display", "block");	
    	// add test to p tag in infobox
    	d3.select("p").text("This circle has a radius of " + circle.attr("r") + " pixels.");
    },
    
    myMouseOutFunction : function() {
    	var circle = d3.select(this);
    	circle.attr("fill", "steelblue" );
    	// display none removes element totally, whereas visibilty in last example just hid it
    	d3.select(".infobox").style("display", "none");	
    },
 
	myMouseMoveFunction : function() {
    	// save selection of infobox so that we can later change it's position
    	var infobox = d3.select(".infobox");
    	// this returns x,y coordinates of the mouse in relation to our svg canvas
    	//var coord = d3.svg.mouse(this)
    	var coord = d3.mouse(this)
    	// now we just position the infobox roughly where our mouse is
    	infobox.style("left", coord[0] + 15  + "px" );
    	infobox.style("top", coord[1] + "px");
	}
    
});
