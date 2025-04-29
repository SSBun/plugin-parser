document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const jsonTextInput = document.getElementById('json-text-input');
    const loadJsonButton = document.getElementById('load-json-button');
    const nodeDetails = document.getElementById('node-details');
    const nodeMapCanvas = document.getElementById('node-map-canvas');
    
    let currentJsonData = null; // Store the loaded JSON data
    let simulation = null; // D3 force simulation instance

    // --- File Input Handling ---
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleFile(file);
        }
    });

    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('dragover');
        if (event.dataTransfer.items) {
            if (event.dataTransfer.items[0].kind === 'file') {
                const file = event.dataTransfer.items[0].getAsFile();
                handleFile(file);
            }
        } else {
            const file = event.dataTransfer.files[0];
            handleFile(file);
        }
    });

    function handleFile(file) {
        if (file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    currentJsonData = jsonData;
                    renderD3Graph(currentJsonData);
                } catch (error) {
                    alert('Error parsing JSON file: ' + error.message);
                    clearVisualization();
                }
            };
            reader.readAsText(file);
        } else {
            alert('Please drop a valid JSON file.');
        }
    }

    // --- Text Input Handling ---
    loadJsonButton.addEventListener('click', () => {
        const jsonText = jsonTextInput.value.trim();
        if (jsonText) {
            try {
                const jsonData = JSON.parse(jsonText);
                currentJsonData = jsonData;
                renderD3Graph(currentJsonData);
                jsonTextInput.value = ''; // Clear input after successful load
            } catch (error) {
                alert('Error parsing JSON text: ' + error.message);
                clearVisualization();
            }
        } else {
            alert('Please paste JSON text into the area.');
        }
    });

    // --- D3.js Visualization ---
    function renderD3Graph(jsonData) {
        console.log("Rendering D3 graph for:", jsonData);
        clearVisualization();

        if (!jsonData || typeof jsonData !== 'object') {
            displayMessage('Invalid JSON data structure.');
            return;
        }

        // Parse JSON into nodes and links
        const graph = parseJsonForD3(jsonData);
        
        // Set up the SVG container
        const width = nodeMapCanvas.clientWidth;
        const height = nodeMapCanvas.clientHeight;
        
        const svg = d3.select("#node-map-canvas")
            .append("svg")
            .attr("width", width)
            .attr("height", height);
            
        // Create a group for the graph
        const g = svg.append("g");
            
        // Add zoom behavior
        svg.call(d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            }));
            
        // Create links
        const link = g.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(graph.links)
            .enter()
            .append("line")
            .attr("class", "link");
            
        // Create nodes
        const node = g.append("g")
            .attr("class", "nodes")
            .selectAll(".node")
            .data(graph.nodes)
            .enter()
            .append("g")
            .attr("class", "node")
            .on("click", function(event, d) {
                // Highlight this node and display its details
                d3.selectAll(".node").classed("highlighted", false);
                d3.select(this).classed("highlighted", true);
                showNodeDetails(d.data);
                event.stopPropagation();
            });
            
        // Add circles to nodes
        node.append("circle")
            .attr("r", d => getNodeRadius(d))
            .style("fill", d => getNodeColor(d.type));
            
        // Add labels to nodes
        node.append("text")
            .attr("dy", ".35em")
            .attr("text-anchor", "middle")
            .text(d => d.type);
            
        // Handle click on background to deselect
        svg.on("click", () => {
            d3.selectAll(".node").classed("highlighted", false);
            displayMessage("Click on a node to see its details.");
        });
            
        // Set up force simulation
        simulation = d3.forceSimulation(graph.nodes)
            .force("link", d3.forceLink(graph.links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("x", d3.forceX(width / 2).strength(0.1))
            .force("y", d3.forceY(height / 2).strength(0.1))
            .on("tick", () => {
                link
                    .attr("x1", d => d.source.x)
                    .attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x)
                    .attr("y2", d => d.target.y);
                    
                node.attr("transform", d => `translate(${d.x},${d.y})`);
            });
    }

    function parseJsonForD3(data) {
        const nodes = [];
        const links = [];
        const nodeMap = new Map(); // To track nodes by ID for link creation
        
        // Helper function to recursively process nodes
        function processNode(jsonNode, parentId = null) {
            if (!jsonNode || typeof jsonNode !== 'object') return null;
            
            // Create a unique ID if none exists
            const nodeId = jsonNode.id || `node_${Math.random().toString(16).slice(2)}`;
            
            // Create D3 node object
            const node = {
                id: nodeId,
                type: jsonNode.nodeType || 'Unknown',
                data: jsonNode // Store original data for details display
            };
            
            // Add to nodes array and map
            nodes.push(node);
            nodeMap.set(nodeId, node);
            
            // Link to parent if it exists
            if (parentId) {
                links.push({
                    source: parentId,
                    target: nodeId
                });
            }
            
            // Process children recursively
            if (jsonNode.children && Array.isArray(jsonNode.children)) {
                jsonNode.children.forEach(child => {
                    processNode(child, nodeId);
                });
            }
            
            // Process plugins as children
            if (jsonNode.plugins && Array.isArray(jsonNode.plugins)) {
                jsonNode.plugins.forEach(plugin => {
                    processNode(plugin, nodeId);
                });
            }
            
            // Optional: Add relay nodes
            if (jsonNode.relays && Array.isArray(jsonNode.relays)) {
                jsonNode.relays.forEach(relay => {
                    processNode(relay, nodeId);
                });
            }
            
            return node;
        }
        
        // Start processing from root
        processNode(data);
        
        return { nodes, links };
    }

    function getNodeRadius(node) {
        // Different sizes based on node type
        switch(node.type) {
            case 'Composer': return 25;
            case 'Container': return 20;
            case 'Plugin': return 15;
            case 'Relay': return 12;
            default: return 10;
        }
    }

    function getNodeColor(nodeType) {
        // Different colors based on node type
        switch(nodeType) {
            case 'Composer': return '#8ecae6';
            case 'Container': return '#219ebc';
            case 'Plugin': return '#ffb703';
            case 'Relay': return '#fb8500'; 
            case 'Environment': return '#4CAF50';
            default: return '#adb5bd';
        }
    }

    function clearVisualization() {
        // Clear the SVG
        nodeMapCanvas.innerHTML = '';
        
        // Stop any active simulation
        if (simulation) {
            simulation.stop();
            simulation = null;
        }
        
        // Clear details
        displayMessage("Load data and click on a node in the map below to see its details.");
    }

    // --- Details Panel ---
    function showNodeDetails(nodeData) {
        // Format the JSON data for pretty display with syntax highlighting
        const formattedJson = JSON.stringify(nodeData, null, 2);
        nodeDetails.innerHTML = `<pre><code class="language-json">${escapeHtml(formattedJson)}</code></pre>`;
        
        // Apply syntax highlighting
        hljs.highlightAll();
    }
    
    function displayMessage(message) {
        nodeDetails.innerHTML = `<p>${message}</p>`;
    }
    
    // Helper function to escape HTML for safe display
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}); 