document.addEventListener('DOMContentLoaded', () => {
  const calcContainer = document.getElementById('calcContainer');
  const addCalcBtn = document.getElementById('addCalcBtn');
  const resetAllBtn = document.getElementById('resetAllBtn');

  // Priority distances in mm:
  const PRIORITY_DISTANCES = [125, 150, 200, 250];

  // Global data
  let allData = [];
  let priorityData = [];
  let allDiameters = new Set();

  // 1) Učitavamo JSON
  fetch('series.json')
    .then(resp => resp.json())
    .then(raw => {
      // Transformišemo distance => mm
      allData = raw.map(item => {
        const distanceMm = Math.round(item.distance * 10);
        return {
          distanceMm,
          diameter: item.diameter,
          area_mm2: item.area_mm2
        };
      });
      priorityData = allData.filter(x => PRIORITY_DISTANCES.includes(x.distanceMm));
      allData.forEach(x => allDiameters.add(x.diameter));

      // Sada možemo dozvoliti Add
      addCalcBtn.disabled = false;

      // 2) Pokušaj da učitaš iz localStorage
      const loaded = loadStateFromLocalStorage();
      // Ako nije uspelo, napravi 1 prazan kalkulator
      if (!loaded) {
        createInitialCalculator();
      }
    })
    .catch(err => console.error('Error loading JSON data:', err));

  // 2) Add New Calculation
  addCalcBtn.addEventListener('click', () => {
    const block = createCalculatorBlock();
    calcContainer.appendChild(block);
    block.dataset.area = '999999'; 
    block.dataset.isCollapsed = 'false';
    reorderBlocksByArea();

    saveAllCalculatorsToLocalStorage();
  });

  // 3) Reset All
  resetAllBtn.addEventListener('click', () => {
    // brišemo localStorage
    localStorage.removeItem('calcBlocks');
    // brišemo sve kalkulatore
    calcContainer.innerHTML = '';
    // kreiramo jedan prazan
    createInitialCalculator();
  });

  function createInitialCalculator() {
    const block = createCalculatorBlock();
    block.dataset.area = '999999';
    block.dataset.isCollapsed = 'false';
    calcContainer.appendChild(block);
    reorderBlocksByArea();
  }

  function reorderBlocksByArea() {
    const blocks = Array.from(calcContainer.children);
    blocks.sort((a, b) => parseInt(a.dataset.area) - parseInt(b.dataset.area));
    blocks.forEach(bl => calcContainer.appendChild(bl));
  }

  // Glavna funkcija za kreiranje kalkulatora
  function createCalculatorBlock() {
    const block = document.createElement('div');
    block.classList.add('calc-block');

    // Napravimo 2 diva: expanded i collapsed
    const expandedDiv = document.createElement('div');
    const collapsedDiv = document.createElement('div');
    collapsedDiv.classList.add('collapsed-row', 'hidden');
    block.appendChild(expandedDiv);
    block.appendChild(collapsedDiv);

    // Title
    const title = document.createElement('div');
    title.classList.add('calc-title');
    title.textContent = 'Rebar Calculator';
    expandedDiv.appendChild(title);

    // FIRST iteration
    const firstIterationDiv = document.createElement('div');
    firstIterationDiv.classList.add('first-iteration');
    firstIterationDiv.innerHTML = `
      <label>Required Area (mm²/m):</label>
      <input type="number" id="areaInput" placeholder="e.g. 1500" />
      <button id="findBtn">Find</button>
      <ul id="firstResults"></ul>
    `;
    expandedDiv.appendChild(firstIterationDiv);

    const areaInput = firstIterationDiv.querySelector('#areaInput');
    const findBtn = firstIterationDiv.querySelector('#findBtn');
    const firstResultsUl = firstIterationDiv.querySelector('#firstResults');

    // REFINE as collapsible
    const refineSection = document.createElement('div');
    refineSection.classList.add('refine-section');
    refineSection.innerHTML = `
      <div class="refine-header">
        Adjust search <span class="arrow">▼</span>
      </div>
      <div class="refine-body hidden">
        <label>Distance (mm):</label>
        <div class="select-wrapper">
          <select id="refineDistanceSelect">
            <option value="">Any distance</option>
          </select>
          <button class="clear-btn" id="clearDistanceBtn">x</button>
        </div>

        <label>Diameter (mm):</label>
        <div class="select-wrapper">
          <select id="refineDiameterSelect">
            <option value="">Any diameter</option>
          </select>
          <button class="clear-btn" id="clearDiameterBtn">x</button>
        </div>
        
        <ul id="refineResults"></ul>
      </div>
    `;
    expandedDiv.appendChild(refineSection);

    const refineHeader = refineSection.querySelector('.refine-header');
    const refineBody = refineSection.querySelector('.refine-body');
    const refineDistanceSelect = refineSection.querySelector('#refineDistanceSelect');
    const clearDistanceBtn = refineSection.querySelector('#clearDistanceBtn');
    const refineDiameterSelect = refineSection.querySelector('#refineDiameterSelect');
    const clearDiameterBtn = refineSection.querySelector('#clearDiameterBtn');
    const refineResultsUl = refineSection.querySelector('#refineResults');

    // Klik na "Adjust search" -> toggl
    refineHeader.addEventListener('click', () => {
      refineBody.classList.toggle('hidden');
      const arrowSpan = refineHeader.querySelector('.arrow');
      arrowSpan.textContent = refineBody.classList.contains('hidden') ? '▼' : '▲';
    });

    // Collapse/Reopen/Delete
    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = 'Collapse';
    collapseBtn.classList.add('btn', 'hidden'); 
    collapseBtn.style.marginTop = '10px';
    expandedDiv.appendChild(collapseBtn);

    const summarySpan = document.createElement('span');
    const reopenBtn = document.createElement('button');
    reopenBtn.textContent = '↓';
    reopenBtn.classList.add('btn', 'light-blue-btn');
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'X';
    deleteBtn.classList.add('btn', 'red-btn');

    collapsedDiv.appendChild(summarySpan);
    const rightBtnsDiv = document.createElement('div');
    rightBtnsDiv.appendChild(reopenBtn);
    rightBtnsDiv.appendChild(deleteBtn);
    collapsedDiv.appendChild(rightBtnsDiv);

    let userArea = 0;

    // "Find" click
    findBtn.addEventListener('click', () => {
      userArea = parseInt(areaInput.value, 10);
      if (!userArea || userArea <= 0) {
        alert('Enter a valid area in mm²');
        return;
      }
      let filtered = priorityData.filter(x => x.area_mm2 >= userArea);

      filtered.sort((a, b) => {
        const diffA = a.area_mm2 - userArea;
        const diffB = b.area_mm2 - userArea;
        if (diffA !== diffB) return diffA - diffB;
        return b.distanceMm - a.distanceMm;
      });
      const top5 = filtered.slice(0, 5);

      renderResults(top5, firstResultsUl);

      if (top5.length > 0) {
        collapseBtn.classList.remove('hidden');
      } else {
        collapseBtn.classList.add('hidden');
      }

      block.dataset.area = userArea.toString();
      reorderBlocksByArea();

      setupRefineSelects();
      saveAllCalculatorsToLocalStorage();
    });

    function setupRefineSelects() {
      refineDistanceSelect.innerHTML = '<option value="">Any distance</option>';
      const allDistancesArr = Array.from(new Set(allData.map(x => x.distanceMm))).sort((a,b) => a-b);
      allDistancesArr.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        refineDistanceSelect.appendChild(opt);
      });

      refineDiameterSelect.innerHTML = '<option value="">Any diameter</option>';
      const diamArr = Array.from(allDiameters).sort((a,b)=>a-b);
      diamArr.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        refineDiameterSelect.appendChild(opt);
      });

      clearDistanceBtn.style.display = 'none';
      clearDiameterBtn.style.display = 'none';

      refineDistanceSelect.addEventListener('change', () => {
        toggleClearBtn(refineDistanceSelect, clearDistanceBtn);
        doRefine();
      });
      refineDiameterSelect.addEventListener('change', () => {
        toggleClearBtn(refineDiameterSelect, clearDiameterBtn);
        doRefine();
      });
      clearDistanceBtn.addEventListener('click', () => {
        refineDistanceSelect.value = '';
        toggleClearBtn(refineDistanceSelect, clearDistanceBtn);
        doRefine();
      });
      clearDiameterBtn.addEventListener('click', () => {
        refineDiameterSelect.value = '';
        toggleClearBtn(refineDiameterSelect, clearDiameterBtn);
        doRefine();
      });
    }

    function toggleClearBtn(selectEl, btnEl) {
      if (selectEl.value) {
        btnEl.style.display = 'block';
      } else {
        btnEl.style.display = 'none';
      }
    }

    function doRefine() {
      const distVal = refineDistanceSelect.value; 
      const diamVal = refineDiameterSelect.value;

      let arr = allData.filter(x => x.area_mm2 >= userArea);
      if (distVal) {
        arr = arr.filter(x => x.distanceMm === Number(distVal));
      }
      if (diamVal) {
        arr = arr.filter(x => x.diameter === Number(diamVal));
      }

      arr.sort((a, b) => {
        const diffA = a.area_mm2 - userArea;
        const diffB = b.area_mm2 - userArea;
        if (diffA !== diffB) return diffA - diffB;
        return b.distanceMm - a.distanceMm;
      });
      const top5 = arr.slice(0, 5);

      renderResults(top5, firstResultsUl);
      saveAllCalculatorsToLocalStorage();
    }

    // COLLAPSE
    collapseBtn.addEventListener('click', () => {
      expandedDiv.classList.add('hidden');
      collapsedDiv.classList.remove('hidden');
      block.dataset.isCollapsed = 'true';

      let text = `Area=<span style="color:red; font-weight:bold;">${userArea} mm²</span>; Results: `;
      const selectedLi = firstResultsUl.querySelector('li.selected');
      if (!selectedLi) {
        text += 'No results.';
      } else {
        const fullText = selectedLi.textContent.trim(); // npr "⌀8-150 => 335 mm²"
        const parts = fullText.split(' => ');
        if (parts.length === 2) {
          // Samo seriju pocrvenimo
          text += `<span style="color:red; font-weight:bold;">${parts[0]}</span> => ${parts[1]}`;
        } else {
          text += `<span style="color:red; font-weight:bold;">${fullText}</span>`;
        }
      }
      summarySpan.innerHTML = text;

      saveAllCalculatorsToLocalStorage();
    });

    // REOPEN
    reopenBtn.addEventListener('click', () => {
      collapsedDiv.classList.add('hidden');
      expandedDiv.classList.remove('hidden');
      block.dataset.isCollapsed = 'false';

      saveAllCalculatorsToLocalStorage();
    });

    // DELETE
    deleteBtn.addEventListener('click', () => {
      block.remove();
      saveAllCalculatorsToLocalStorage();
    });

    return block;
  }

  // renderResults
  function renderResults(list, ul) {
    ul.innerHTML = '';
    if (!list.length) {
      ul.innerHTML = '<li>No matching options found.</li>';
      return;
    }
    list.forEach((item, index) => {
      const li = document.createElement('li');
      li.classList.add('result-item');

      li.innerHTML = `
        <span class="series-code">⌀${item.diameter}-${item.distanceMm}</span>
        => <span class="area-val">${item.area_mm2} mm²</span>
      `;
      if (index === 0) {
        li.classList.add('selected');
      }

      // Klik => samo jedan selektovan
      li.addEventListener('click', () => {
        ul.querySelectorAll('li.selected').forEach(s => s.classList.remove('selected'));
        li.classList.add('selected');
        saveAllCalculatorsToLocalStorage();
      });

      ul.appendChild(li);
    });
  }

  // LocalStorage snimanje
  function saveAllCalculatorsToLocalStorage() {
    const blocks = Array.from(calcContainer.children);
    const toSave = blocks.map(block => {
      const area = parseInt(block.dataset.area || '0', 10);
      const isCollapsed = block.dataset.isCollapsed === 'true';

      const selLi = block.querySelector('.first-iteration ul li.selected');
      const selectedText = selLi ? selLi.textContent.trim() : '';

      return {
        area,
        isCollapsed,
        selectedText
      };
    });

    localStorage.setItem('calcBlocks', JSON.stringify(toSave));
    // Debug
    console.log('Saved to localStorage:', toSave);
  }

  // LocalStorage učitavanje
  function loadStateFromLocalStorage() {
    const stored = localStorage.getItem('calcBlocks');
    if (!stored) return false;

    const arr = JSON.parse(stored);
    if (!Array.isArray(arr) || arr.length === 0) return false;

    arr.forEach(obj => {
      const block = createCalculatorBlock();
      calcContainer.appendChild(block);

      block.dataset.area = obj.area.toString();
      block.dataset.isCollapsed = obj.isCollapsed ? 'true' : 'false';

      // Upis u input pa "Find"
      const areaInput = block.querySelector('#areaInput');
      areaInput.value = obj.area;
      const findBtn = block.querySelector('#findBtn');
      findBtn.click(); // generisemo initial results

      // Selektovani li
      if (obj.selectedText) {
        const lis = block.querySelectorAll('.first-iteration ul li');
        lis.forEach(li => {
          if (li.textContent.trim() === obj.selectedText) {
            li.classList.add('selected');
          } else {
            li.classList.remove('selected');
          }
        });
      }

      // Ako je collapsed
      if (obj.isCollapsed) {
        const expandedDiv = block.querySelector('.calc-block > div:nth-child(1)');
        const collapsedDiv = block.querySelector('.collapsed-row');
        expandedDiv.classList.add('hidden');
        collapsedDiv.classList.remove('hidden');
      }
    });

    reorderBlocksByArea();
    // Debug
    console.log('Loaded from localStorage:', arr);
    return true;
  }
});
