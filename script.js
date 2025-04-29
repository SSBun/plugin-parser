document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const jsonTextInput = document.getElementById('json-text-input');
    const loadJsonButton = document.getElementById('load-json-button');
    const nodeDetails = document.getElementById('node-details');
    const nodeMapCanvas = document.getElementById('node-map-canvas');
    
    let currentJsonData = null; // Store the loaded JSON data
    let simulation = null; // D3 force simulation instance
    let tooltip = null; // Tooltip element

    // Initialize tooltip
    initTooltip();
    
    // Check localStorage for saved data and restore if available
    restoreDataFromLocalStorage();

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
            // Show loading
            showLoading();
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const jsonText = e.target.result;
                    const jsonData = JSON.parse(jsonText);
                    // Save to localStorage
                    saveToLocalStorage(jsonText);
                    currentJsonData = jsonData;
                    renderForceDirectedTree(currentJsonData);
                } catch (error) {
                    showError('Error parsing JSON file: ' + error.message);
                    clearVisualization();
                }
            };
            reader.readAsText(file);
        } else {
            showError('Please drop a valid JSON file.');
        }
    }

    // --- Text Input Handling ---
    loadJsonButton.addEventListener('click', () => {
        processTextInput();
    });
    
    // Allow pressing Enter in the text input to submit
    jsonTextInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            processTextInput();
        }
    });
    
    function processTextInput() {
        const jsonText = jsonTextInput.value.trim();
        if (jsonText) {
            // Show loading
            showLoading();
            
            try {
                const jsonData = JSON.parse(jsonText);
                // Save to localStorage
                saveToLocalStorage(jsonText);
                currentJsonData = jsonData;
                renderForceDirectedTree(currentJsonData);
                // Don't clear the input, it's useful to keep it for reference
                // jsonTextInput.value = ''; // Clear input after successful load
            } catch (error) {
                showError('Error parsing JSON text: ' + error.message);
                clearVisualization();
            }
        } else {
            showError('Please paste JSON text into the area.');
        }
    }
    
    // --- Local Storage Functions ---
    function saveToLocalStorage(jsonText) {
        try {
            localStorage.setItem('pluginVisualizerJsonData', jsonText);
            console.log('Data saved to localStorage');
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }
    
    function restoreDataFromLocalStorage() {
        try {
            const savedData = localStorage.getItem('pluginVisualizerJsonData');
            if (savedData) {
                console.log('Found saved data, restoring and processing...');
                jsonTextInput.value = savedData; // Keep the data in the textarea for reference
                
                // Directly process the restored data
                processTextInput();
                
                // Optionally, show a small, temporary confirmation message instead of a button
                const confirmation = document.createElement('div');
                confirmation.className = 'bg-green-100 text-green-800 p-2 rounded text-sm mb-2 fade-out';
                confirmation.textContent = 'Restored and loaded data from last session.';
                
                const inputArea = document.querySelector('.input-area');
                inputArea.insertBefore(confirmation, inputArea.firstChild);
                
                // Remove the confirmation after a few seconds
                setTimeout(() => {
                    confirmation.remove();
                }, 5000); // Remove after 5 seconds
            }
        } catch (e) {
            console.warn('Failed to restore from localStorage:', e);
        }
    }

    // --- D3.js Force-Directed Tree Visualization ---
    function renderForceDirectedTree(jsonData) {
        console.log("Rendering force-directed tree for:", jsonData);
        clearVisualization();

        if (!jsonData || typeof jsonData !== 'object') {
            displayMessage('Invalid JSON data structure.');
            return;
        }

        // Convert flat JSON into hierarchical structure for tree layout
        const hierarchyData = convertToHierarchy(jsonData);
        
        // Set up the SVG container dimensions (enforce 60% height)
        const width = nodeMapCanvas.clientWidth;
        const height = width * 0.6; // Calculate height as 60% of width
        // Force height of the container div
        nodeMapCanvas.style.height = `${height}px`;
        
        const svg = d3.select("#node-map-canvas")
            .html('') // Clear any previous content
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%") // Set SVG height to 100% of the container
            .attr("viewBox", [0, 0, width, height]) // Use calculated dimensions
            .attr("class", "bg-white");
            
        // Create a group for the graph that can be zoomed/panned
        const g = svg.append("g");
            
        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });
            
        // Apply zoom to the SVG, but filter events on nodes to allow dragging
        svg.call(zoom).on("dblclick.zoom", null); // Disable double-click zoom
        
        // Prepare nodes and links from hierarchy
        const root = hierarchyData; // The root of the hierarchy
        const nodes = root.descendants();
        const links = root.links();
        
        // Remove fixed root position - let simulation handle it
        // root.fx = width / 2;
        // root.fy = height / 2;
        
        // Set up force simulation
        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links)
                .id(d => d.id)
                .distance(d => 50 + getNodeRadius(d.source.data) + getNodeRadius(d.target.data))
                .strength(1.5)) // Keep link strength high for elasticity
            .force("charge", d3.forceManyBody().strength(-600)) // Repulsion force
            .force("center", d3.forceCenter(width / 2, height / 2).strength(0.1)) // Re-enable centering force
            // Optionally add weak X/Y forces to encourage centering
            // .force("x", d3.forceX(width / 2).strength(0.05))
            // .force("y", d3.forceY(height / 2).strength(0.05))
            .force("collision", d3.forceCollide().radius(d => getNodeRadius(d.data) + 5).strength(1))
            .on("tick", ticked);
            
        // Create the links
        const link = g.append("g")
            .attr("class", "links")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke-width", 1.5);
        
        // Create the nodes
        const node = g.append("g")
            .attr("class", "nodes")
            .selectAll(".node")
            .data(nodes)
            .join("g")
            .attr("class", d => `node ${d.data.type}`)
            .call(drag(simulation)) // Apply drag behavior (no root check needed)
            .on("click", function(event, d) {
                event.stopPropagation(); // Prevent zoom trigger on click
                // Highlight this node and display its details
                d3.selectAll(".node").classed("highlighted", false);
                d3.select(this).classed("highlighted", true);
                showNodeDetails(d.data.data);
            })
            .on("mouseover", function(event, d) {
                // Show tooltip
                showTooltip(event, d);
            })
            .on("mouseout", function() {
                // Hide tooltip
                hideTooltip();
            });
        
        // Add circles to nodes
        node.append("circle")
            .attr("r", d => getNodeRadius(d.data))
            .attr("fill", d => getNodeColor(d.data.type))
            .attr("stroke", "#333")
            .attr("stroke-width", 1.5);
        
        // Add labels to nodes
        node.append("text")
            .attr("dy", "0.35em")
            .attr("x", d => d.children ? -getNodeRadius(d.data) - 5 : getNodeRadius(d.data) + 5)
            .attr("text-anchor", d => d.children ? "end" : "start")
            .text(d => d.data.type)
            .attr("fill", "#333")
            .attr("font-size", "10px")
            .attr("font-weight", "500");
            
        // Tick function to update positions
        function ticked() {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            
            node.attr("transform", d => `translate(${d.x},${d.y})`);
        }
        
        // Add drag capabilities (modified for snap-back)
        function drag(simulation) { 
            function dragstarted(event, d) {
                // Stop propagation to prevent zoom/pan on node drag
                event.sourceEvent.stopPropagation();
                if (!event.active) simulation.alphaTarget(0.3).restart(); // Heat up simulation
                d.fx = d.x; // Fix position during drag
                d.fy = d.y;
            }
            
            function dragged(event, d) {
                d.fx = event.x; // Update fixed position
                d.fy = event.y;
            }
            
            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0); // Cool down simulation
                // Release the fixed position, allowing simulation forces to take over (snap-back)
                d.fx = null;
                d.fy = null;
            }
            
            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }

        // Hide loading indicator
        hideLoading();
    }

    // Convert a JSON structure to D3 hierarchy
    function convertToHierarchy(data) {
        // First, convert the JSON to a hierarchical structure
        const root = buildHierarchyFromJson(data);
        
        // Then convert to D3 hierarchy
        return d3.hierarchy(root);
    }
    
    function buildHierarchyFromJson(jsonNode, parent = null) {
        if (!jsonNode || typeof jsonNode !== 'object') return null;
        
        // Create a node object with basic properties
        const node = {
            id: jsonNode.id || `node_${Math.random().toString(16).slice(2)}`,
            type: jsonNode.nodeType || 'Unknown',
            data: jsonNode, // Keep original data for details display
            children: []
        };
        
        // Add children recursively
        if (jsonNode.children && Array.isArray(jsonNode.children)) {
            jsonNode.children.forEach(childData => {
                const childNode = buildHierarchyFromJson(childData, node);
                if (childNode) node.children.push(childNode);
            });
        }
        
        // Add plugins as children
        if (jsonNode.plugins && Array.isArray(jsonNode.plugins)) {
            jsonNode.plugins.forEach(pluginData => {
                const pluginNode = buildHierarchyFromJson(pluginData, node);
                if (pluginNode) node.children.push(pluginNode);
            });
        }
        
        // Add relays as children
        if (jsonNode.relays && Array.isArray(jsonNode.relays)) {
            jsonNode.relays.forEach(relayData => {
                const relayNode = buildHierarchyFromJson(relayData, node);
                if (relayNode) node.children.push(relayNode);
            });
        }
        
        // Add environments as children
        if (jsonNode.environments && Array.isArray(jsonNode.environments)) {
            jsonNode.environments.forEach(envData => {
                const envNode = buildHierarchyFromJson(envData, node);
                if (envNode) node.children.push(envNode);
            });
        }
        
        return node;
    }

    function getNodeRadius(node) {
        // Different sizes based on node type
        switch(node.type) {
            case 'Composer': return 20;
            case 'Container': return 16;
            case 'Plugin': return 12;
            case 'Relay': return 8;
            case 'Environment': return 8;
            default: return 8;
        }
    }

    function getNodeColor(nodeType) {
        // Different colors based on node type
        switch(nodeType) {
            case 'Composer': return '#3F83F8'; // primary-500
            case 'Container': return '#1E429F'; // primary-800
            case 'Plugin': return '#76A9FA';    // primary-400
            case 'Relay': return '#A4CAFE';     // primary-300
            case 'Environment': return '#34D399'; // green
            default: return '#CBD5E0'; // gray
        }
    }

    function getNodeTypeDescription(nodeType) {
        switch(nodeType) {
            case 'Composer': return 'Main composition root';
            case 'Container': return 'Container for plugins';
            case 'Plugin': return 'Plugin implementation';
            case 'Relay': return 'Message relay';
            case 'Environment': return 'Environment configuration';
            default: return nodeType;
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
        
        // Create a container with limited width to prevent horizontal expansion
        nodeDetails.innerHTML = `
            <div class="w-full overflow-hidden">
                <pre><code class="language-json overflow-x-auto">${escapeHtml(formattedJson)}</code></pre>
            </div>
        `;
        
        // Apply syntax highlighting
        hljs.highlightAll();
    }
    
    function displayMessage(message) {
        nodeDetails.innerHTML = `
            <div class="flex items-center justify-center h-full text-center">
                <div>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>${message}</p>
                </div>
            </div>
        `;
    }

    function showError(message) {
        nodeDetails.innerHTML = `
            <div class="flex items-center justify-center h-full text-center">
                <div>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-red-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="text-red-500 font-medium">${message}</p>
                </div>
            </div>
        `;
    }

    // --- Loading Indicator ---
    function showLoading() {
        // Clear any existing content
        nodeMapCanvas.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center">
                    <div class="loading-spinner mx-auto mb-4"></div>
                    <p class="text-gray-600">Processing data...</p>
                </div>
            </div>
        `;
        
        // Also update details panel
        nodeDetails.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center">
                    <div class="loading-spinner mx-auto mb-4"></div>
                    <p class="text-gray-600">Processing data...</p>
                </div>
            </div>
        `;
    }
    
    function hideLoading() {
        // This is handled by the rendering function
    }

    // --- Tooltip ---
    function initTooltip() {
        // Create tooltip element
        tooltip = d3.select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);
    }
    
    function showTooltip(event, d) {
        const nodeType = d.data.type || 'Unknown';
        const nodeId = d.data.id || 'No ID';
        const description = getNodeTypeDescription(nodeType);
        
        tooltip.transition()
            .duration(200)
            .style("opacity", .9);
            
        tooltip.html(`
            <div class="font-medium">${nodeType}</div>
            <div class="text-xs opacity-75">${description}</div>
            ${nodeId !== 'No ID' ? `<div class="text-xs mt-1">ID: ${nodeId}</div>` : ''}
        `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
    }
    
    function hideTooltip() {
        tooltip.transition()
            .duration(500)
            .style("opacity", 0);
    }
    
    // Helper function to escape HTML for safe display
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}); 