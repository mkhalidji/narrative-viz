const state = {
  zoomedState: undefined,
};

async function showMap() {
  const mapWidth = 975;
  const mapHeight = 610;
  const chartHeight = 120;

  const width = mapWidth;
  const height = mapHeight + chartHeight;

  const data = await prepareGeoData();
  const { us, national, states, counties, mandates, restrictions } = data;

  const [startDate, endDate] = d3.extent(national, (d) => d.date);

  const filterDataToInterval = (sd, ed) => {
    const intervalStates = d3.filter(
      states,
      (d) => d.date >= sd && d.date <= ed
    );

    return topojson.feature(us, us.objects.states).features.map((feature) => {
      const {
        properties: { name: stateName },
      } = feature;
      const values = d3
        .filter(intervalStates, (d) => d.state === stateName)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      const cases = values[values.length - 1].cases - values[0].cases;
      const deaths = values[values.length - 1].deaths - values[0].deaths;
      return {
        ...feature,
        cases,
        deaths,
      };
    });
  };

  const casesColor = d3
    .scaleDivergingPow([0, 25000, 75000], ['#22763f', '#f4cf64', '#be2a3e'])
    .clamp(true);

  const borderColor = d3
    .scaleDiverging([0, 25000, 75000], ['lightgrey', '#000', 'lightgrey'])
    .clamp(true);

  const zoom = d3.zoom().scaleExtent([1, 8]).on('zoom', zoomed);

  const svg = d3.select('svg').attr('viewBox', [0, 0, width, height]);

  const xScale = d3
    .scaleTime()
    .domain([startDate, endDate])
    .range([10, width - 10]);

  const yScale = d3.scaleLinear().domain([0, d3.max(national, (d) => d.cases)]);

  const line = (xs, ys) =>
    d3
      .line()
      .x((d) => xs(d.date))
      .y((d) => ys(d.cases));

  const brush = d3
    .brushX()
    .extent([
      [10, mapHeight - 1],
      [width - 10, mapHeight + chartHeight - 20 + 1],
    ])
    .on('brush', brushed)
    .on('end', brushended);

  svg
    .append('path')
    .datum(national)
    .attr('fill', 'none')
    .attr('stroke', 'steelblue')
    .attr(
      'd',
      line(
        xScale,
        yScale.copy().range([mapHeight + chartHeight - 20, mapHeight + 10])
      )
    );

  svg.on('click', reset);

  const path = d3.geoPath();

  const g = svg.append('g');

  const states_g = g
    .attr('cursor', 'pointer')
    // .attr("fill", "#4453")
    .attr('fill', 'whitesmoke')
    .selectAll('g')
    .data(filterDataToInterval(startDate, endDate))
    .join('g')
    .on('click', stateClicked)
    .call(zoom);

  states_g.attr('fill', ({ deaths }) => {
    return casesColor(deaths);
  });

  states_g
    .append('path')
    .attr('d', path)
    .on('clicked', stateClicked)
    .append('title')
    .text(({ properties: { name: state }, cases, deaths }) => {
      return `${state}\nCases: ${cases}\nDeaths: ${deaths}`;
    });

  g.append('path')
    .attr('id', 'state-borders')
    .attr('fill', 'none')
    .attr('stroke', '#a2a2a2')
    .attr('stroke-linejoin', 'round')
    .attr('d', path(topojson.mesh(us, us.objects.states, (a, b) => a !== b)));

  g.append('path')
    .attr('id', 'us-border')
    .attr('fill', 'none')
    .attr('stroke', '#a2a2a2')
    .attr('d', path(topojson.mesh(us, us.objects.nation)));

  const defaultSelection = [xScale.range()[0], xScale.range()[1]];
  const gb = svg.append('g').call(brush).call(brush.move, defaultSelection);
  gb.on('dblclick', function () {
    gb.call(brush.move, defaultSelection);
  });

  function brushed({ selection }) {
    if (selection) {
      states_g
        .data(filterDataToInterval(...selection.map(xScale.invert)))
        .attr('fill', ({ deaths }) => casesColor(deaths))
        .selectChild('path')
        .attr('d', path)
        .selectChild('title')
        .text(({ properties: { name: state }, cases, deaths }) => {
          return `${state}\nCases: ${cases}\nDeaths: ${deaths}`;
        });
    }
  }

  function brushended({ selection }) {
    if (!selection) {
      gb.call(brush.move, defaultSelection);
    }
  }

  let zoomedState = undefined;

  async function reset(event, d) {
    const marginWidth = mapWidth / 5;
    const marginHeight = mapHeight / 5;

    const { state: stateName } =
      covidData[d3.select(this).datum().properties.name];
    const [[x0, y0], [x1, y1]] = path.bounds(d);

    const selection = d3.select(this);
    const transform = d3.zoomTransform(d3.select(this).node());

    // d3.select("#left-pane").remove();

    await selection
      .transition()
      .duration(750)
      .call(zoom.transform, d3.zoomIdentity, transform.invert([x0, y0]))
      .end();

    selection
      .selectChild('path')
      .transition()
      .duration(750)
      .style('transform', null);

    d3.select('#county-borders')
      .transition()
      .duration(750)
      .style('opacity', 0)
      .remove();

    const otherStates = states_g.filter(
      ({ properties: { name } }) => stateName !== name
    );
    otherStates.style('display', null).style('z-index', 10, 'important');

    d3.selectAll('#state-borders, #us-border').style('display', null);

    zoomedState = undefined;
  }

  function stateClicked(event, d) {
    event.stopPropagation();

    const marginWidth = mapWidth / 5;
    const marginHeight = mapHeight / 5;

    const { state: stateName } =
      covidData[d3.select(this).datum().properties.name];
    if (zoomedState !== undefined && zoomedState === stateName) {
      return reset.call(this, event, d);
    }
    zoomedState = stateName;
    const { id: stateId } = d3.select(this).datum();
    const { geometries } = us.objects.counties;
    const stateCounties = Object.assign({}, us.objects.counties, {
      geometries: geometries.filter(({ id }) => id.startsWith(stateId)),
    });
    const [[x0, y0], [x1, y1]] = path.bounds(d);

    // svg
    //   .append("rect")
    //   .lower()
    //   .attr("id", "left-pane")
    //   .attr("x", 0)
    //   .attr("y", 0)
    //   .attr("width", marginWidth)
    //   .attr("height", height)
    //   .attr("fill", "whitesmoke")
    //   .attr("opacity", 0)
    //   .transition()
    //   .duration(750)
    //   .attr("opacity", 0.4);
    states_g.transition().style('fill', null);
    d3.select(this)
      .append('path')
      .attr('id', 'county-borders')
      .attr('fill', 'none')
      .attr('stroke', () => borderColor(+covidData[stateName].rate))
      .style('opacity', 0)
      .attr('stroke-linejoin', 'round')
      .attr('d', path(topojson.mesh(us, stateCounties, (a, b) => a !== b)));
    d3.select(this)
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', () => borderColor(+covidData[stateName].rate))
      .attr('stroke-linejoin', 'round')
      .attr(
        'd',
        path(
          topojson.mesh(
            us,
            us.objects.states,
            (a, b) =>
              a.properties.name === stateName || b.properties.name === stateName
          )
        )
      );
    d3.select('#county-borders')
      .transition()
      .duration(750)
      .style('opacity', 1, 'important');
    states_g
      .filter(({ properties: { name } }) => stateName !== name)
      .transition()
      .duration(750)
      .style('display', 'none');

    d3.selectAll('#state-borders, #us-border')
      .transition()
      .duration(750)
      .style('display', 'none');

    const scaleX = (marginWidth - 10) / (x1 - x0),
      scaleY = (marginHeight - 10) / (y1 - y0);
    const scale = d3.min([scaleX, scaleY]);

    const transition = d3.select(this).transition().duration(750);
    transition.call(
      zoom.transform,
      d3.zoomIdentity
        .translate((-(x0 + x1) / 2) * scale, -y0 * scale)
        .scale(scale)
        .translate((marginWidth - 5) / 2 / scale, 5 / scale)
    );
  }

  function zoomed(event) {
    const { transform } = event;
    d3.select(this)
      .attr('transform', transform)
      .attr('stroke-width', 1 / transform.k);
  }
}

async function showMandates() {
  const mandates = await d3.csv(
    'data/State-Level_Vaccine_Mandates_-_All_20240723.csv',
    ({ state, effective_date }) => ({
      state,
      effective_date: new Date(effective_date),
    })
  );

  const dates = mandates.map((d) => d.effective_date);

  const width = 975,
    height = 610,
    marginBottom = 100;
  const xScale = d3
    .scaleTime()
    .domain([d3.min(dates), d3.max(dates)])
    .nice()
    .range([10, width - 10]);

  const svg = d3
    .select('svg')
    .attr('viewBox', [0, 0, width, height])
    .attr('width', width)
    .attr('height', height);

  const dots = svg
    .selectAll('circle')
    .data(mandates)
    .join('circle')
    .attr('cx', ({ effective_date }) => xScale(effective_date))
    .attr('cy', height / 2)
    .attr('r', 2.5)
    .attr('fill', 'whitesmoke');

  dots
    .append('title')
    .text(({ state, effective_date }) => `${state} on ${effective_date}`);

  svg
    .append('g')
    .attr('transform', `translate(0,${height - marginBottom})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(d3.timeMonth.every(1))
        .tickFormat((date) => {
          const month = date.getMonth(),
            year = date.getFullYear();
          const monthName = [
            year,
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
          ];

          return monthName[month];
        })
    );

  const parseTime = d3.timeParse('%d-%b-%y');
  const timeFormat = d3.timeFormat('%d-%b-%y');

  //Skipping setting domains for sake of example
  const x = d3.scaleTime().range([0, 800]);
  const y = d3.scaleLinear().range([300, 0]);
  const type = d3.annotationCallout;

  const annotationGroup = svg
    .append('g')
    .attr('class', 'annotation-group')
    .attr('fill', 'white');

  dots.each(function (d, i) {
    d3.select(this)
      .on('click', function () {})
      .on('mouseover', function () {
        const makeAnnotations = d3
          .annotation()
          .type(type)
          .accessors({
            x: ({ effective_date }) => xScale(effective_date),
            y: () => height / 2,
          })
          .accessorsInverse({
            effective_date: (d) => timeFormat(x.invert(d.x)),
          })
          .annotations([
            {
              note: {
                title: `${d3.timeFormat('%B %Y')(d.effective_date)}`,
                label: `${d.state}`,
              },
              data: d,
              className: 'show-bg',
              dy: -50,
              dx: 100,
            },
          ]);

        annotationGroup.call(makeAnnotations);
      })
      .on('mouseout', function () {
        annotationGroup.call(d3.annotation().annotations([]));
      });
  });
}

async function showGraphs() {
  const width = 975;
  const height = 610;

  const covidData = Object.groupBy(
    await d3.csv(
      'https://raw.githubusercontent.com/mkhalidji/covid-19-data/master/us-states.csv',
      (d) => ({
        ...d,
        date: new Date(d.date),
        cases: +d.cases,
        deaths: +d.deaths,
        rate: +d.deaths === 0 ? 0 : (+d.deaths / +d.cases) * 100,
      })
    ),
    (d) => d.state
  );

  const caCovidData = covidData['California'].map((d) => [d.date, d.rate]);

  const [minDate, maxDate] = d3.extent(caCovidData.map((d) => d[0]));

  const xScale = d3
    .scaleTime()
    .domain([minDate, maxDate])
    .range([5, width - 5]);

  const rateScale = d3
    .scaleLinear()
    .domain([0, 10])
    .range([height - 10, 10]);

  const lineGraph = d3.line(
    (d) => xScale(d[0]),
    (d) => rateScale(d[1])
  );

  const svg = d3
    .select('svg')
    .attr('viewBox', [0, 0, width, height])
    .attr('width', width)
    .attr('height', height);

  svg
    .append('path')
    .datum(caCovidData)
    .attr('d', lineGraph)
    .attr('fill', 'none')
    .attr('stroke', 'whitesmoke')
    .attr('stroke-width', 2);

  const mouse_g = svg
    .append('g')
    .classed('mouse', true)
    .style('display', 'none');
  mouse_g
    .append('rect')
    .attr('width', 2)
    .attr('x', -1)
    .attr('height', height - 20)
    .attr('fill', 'lightgray');
  mouse_g.append('circle').attr('r', 5).attr('stroke', 'whitesmoke');
  mouse_g.append('text');

  svg.on('mouseover', function (mouse) {
    mouse_g.style('display', 'block');
  });

  svg.on('mousemove', function (mouse) {
    const [x_cord, y_cord] = d3.pointer(mouse);
    const ratio = x_cord / (width - 20);
    const now = new Date(
      minDate.getTime() +
        Math.round(ratio * (maxDate.getTime() - minDate.getTime()))
    );
    const index = d3.maxIndex(
      caCovidData.map((d) => d[0].getTime()).filter((d) => d < now.getTime())
    );
    if (index < 0) {
      mouse_g.style('display', 'none');
      return;
    }
    const datum = caCovidData[index];
    const rate = datum[1];
    mouse_g.attr(
      'transform',
      `translate(${xScale(datum[0])},${rateScale(10)})`
    );
    mouse_g
      .select('text')
      .text(`${now.toDateString()}, Mortality: ${rate.toFixed(2)}%`)
      .attr('stroke', 'whitesmoke')
      .attr('text-anchor', 'middle');

    mouse_g.select('circle').attr('cy', rateScale(rate) - 10);
  });
  svg.on('mouseout', function (mouse) {
    mouse_g.style('display', 'none');
  });
}

const runningDiff = (series) => {
  const daily = Array.from(series);

  for (let i = 1; i < daily.length; i++) {
    daily[i] = {
      ...daily[i],
      cases: series[i].cases - series[i - 1].cases,
      deaths: series[i].deaths - series[i - 1].deaths,
    };
  }

  return daily;
};

function fetchNationalData() {
  return d3.csv(
    'https://raw.githubusercontent.com/nytimes/covid-19-data/master/us.csv',
    (d) => ({
      ...d,
      date: new Date(d.date),
      cases: +d.cases,
      deaths: +d.deaths,
    })
  );
}

function fetchStateData() {
  return d3.csv(
    'https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv',
    (d) => ({
      ...d,
      date: new Date(d.date),
      cases: +d.cases,
      deaths: +d.deaths,
    })
  );
}

function fetchCountyData() {
  return d3.csv(
    'https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-counties.csv',
    (d) => ({
      ...d,
      date: new Date(d.date),
      cases: +d.cases,
      deaths: +d.deaths,
    })
  );
}

function prepareCovidData() {
  return Promise.all([
    fetchNationalData(),
    fetchStateData(),
    fetchCountyData(),
  ]);
}

function prepareMandateData() {
  return Promise.all([
    d3.csv('data/State-Level_Vaccine_Mandates_-_All_20240723.csv', (d) => ({
      type: 'mandate',
      ...d,
      date_signed: new Date(d.date_signed),
      effective_date: new Date(d.effective_date),
    })),
    d3.csv(
      'data/State-Level_Restrictions_on_Vaccine_Mandates___All_20240723.csv',
      (d) => ({
        type: 'restriction',
        ...d,
        date_signed: new Date(d.date_signed),
        effective_date: new Date(d.effective_date),
      })
    ),
  ]);
}

async function prepareGeoData() {
  const [us, [national, states, counties], [mandates, restrictions]] =
    await Promise.all([
      d3.json('data/counties-albers-10m.json'),
      prepareCovidData(),
      prepareMandateData(),
    ]);

  return { us, national, states, counties, mandates, restrictions };
}

window.onload = showMap;
