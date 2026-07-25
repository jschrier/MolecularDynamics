// Browser-facing adaptation of the original MD.cpp program.  The equations,
// loop bounds, wall treatment, and reported quantities intentionally match it.
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

namespace {
constexpr int particleCount = 216;
constexpr double NA = 6.022140857e23;
constexpr double kBSI = 1.38064852e-23;
struct Gas { double volume, pressure, temperature, time; int steps; };

Gas gasFor(const std::string& gas, std::string& selected) {
  if (gas == "He") { selected = gas; return {1.8399744000000005e-29, 8152287.336171632, 10.864459551225972, 1.7572698825166272e-12, 50000}; }
  if (gas == "Ne") { selected = gas; return {2.0570823999999997e-29, 27223022.27659913, 40.560648991243625, 2.1192341945685407e-12, 20000}; }
  if (gas == "Kr") { selected = gas; return {4.5882712000000004e-29, 59935428.40275003, 199.1817584391428, 8.051563913585078e-13, 20000}; }
  if (gas == "Xe") { selected = gas; return {5.4872e-29, 70527773.72794868, 280.30305642163006, 9.018957925790732e-13, 20000}; }
  selected = "Ar";
  return {3.7949992920124995e-29, 51695201.06691862, 142.095, 2.09618e-12, 20000};
}

struct Simulation {
  std::array<std::array<double, 3>, particleCount> r{}, v{}, a{};
  std::vector<float> frames;
  std::string output, averages, transcript;
  std::string gasName, title;
  Gas gas{};
  double box = 0, volume = 0, dt = 0, temperatureInitial = 0;
  double pAverage = 0, tAverage = 0;
  uint32_t rng = 1;
  int step = 0;
  bool initialized = false, cancelled = false, complete = false;

  uint32_t nextRandom() { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; return rng; }
  double uniform() { return static_cast<double>(nextRandom()) / 4294967296.0; }
  double gaussian() {
    static bool haveSpare = false; static double spare = 0;
    if (haveSpare) { haveSpare = false; return spare; }
    double x, y, q;
    do { x = 2.0 * uniform() - 1.0; y = 2.0 * uniform() - 1.0; q = x*x + y*y; } while (q >= 1.0 || q == 0.0);
    const double factor = std::sqrt(-2.0 * std::log(q) / q);
    spare = x * factor; haveSpare = true; return y * factor;
  }
  void initializePositions() {
    const int n = static_cast<int>(std::ceil(std::pow(particleCount, 1.0 / 3.0)));
    const double spacing = box / n; int p = 0;
    for (int i=0; i<n; ++i) for (int j=0; j<n; ++j) for (int k=0; k<n; ++k, ++p)
      if (p < particleCount) r[p] = {(i+.5)*spacing, (j+.5)*spacing, (k+.5)*spacing};
    std::array<double,3> cm{}; double sum = 0;
    for (int i=0; i<particleCount; ++i) for (int j=0; j<3; ++j) { v[i][j] = gaussian(); cm[j] += v[i][j]; }
    for (double& x : cm) x /= particleCount;
    for (int i=0; i<particleCount; ++i) for (int j=0; j<3; ++j) { v[i][j] -= cm[j]; sum += v[i][j]*v[i][j]; }
    const double lambda = std::sqrt(3.0*(particleCount-1)*temperatureInitial/sum);
    for (auto& atom : v) for (double& x : atom) x *= lambda;
  }
  void accelerations() {
    for (auto& atom : a) atom = {0,0,0};
    for (int i=0; i<particleCount-1; ++i) for (int j=i+1; j<particleCount; ++j) {
      std::array<double,3> rij{}; double rsq = 0;
      for (int k=0; k<3; ++k) { rij[k] = r[i][k] - r[j][k]; rsq += rij[k]*rij[k]; }
      const double f = 24.0*(2.0*std::pow(rsq,-7.0)-std::pow(rsq,-4.0));
      for (int k=0; k<3; ++k) { a[i][k] += rij[k]*f; a[j][k] -= rij[k]*f; }
    }
  }
  double verlet() {
    double impulse = 0; accelerations();
    for (int i=0; i<particleCount; ++i) for (int j=0; j<3; ++j) { r[i][j] += v[i][j]*dt + .5*a[i][j]*dt*dt; v[i][j] += .5*a[i][j]*dt; }
    accelerations();
    for (int i=0; i<particleCount; ++i) for (int j=0; j<3; ++j) {
      v[i][j] += .5*a[i][j]*dt;
      if (r[i][j] < 0.0 || r[i][j] >= box) { v[i][j] *= -1.0; impulse += 2.0*std::fabs(v[i][j])/dt; }
    }
    return impulse/(6.0*box*box);
  }
  double meanSquaredVelocity() const { double total=0; for (const auto& atom:v) for(double x:atom) total+=x*x; return total/particleCount; }
  double kinetic() const { double total=0; for (const auto& atom:v) for(double x:atom) total+=x*x/2.0; return total; }
  double potential() const {
    double result=0; for (int i=0;i<particleCount;++i) for(int j=0;j<particleCount;++j) if(i!=j) {
      double rsq=0; for(int k=0;k<3;++k) { double d=r[i][k]-r[j][k]; rsq+=d*d; }
      const double q=1.0/std::sqrt(rsq); result += 4.0*(std::pow(q,12.0)-std::pow(q,6.0));
    } return result;
  }
  void capture() { for (const auto& atom:r) for (double value:atom) frames.push_back(static_cast<float>(value)); }
  void finish() {
    const double pa=pAverage/gas.steps, ta=tAverage/gas.steps;
    const double z=pa*(volume*gas.volume)/(particleCount*kBSI*ta);
    const double gc=NA*pa*(volume*gas.volume)/(particleCount*ta);
    std::ostringstream avg; avg << "  Total Time (s)      T (K)               P (Pa)      PV/nT (J/(mol K))         Z           V (m^3)              N\n"
      << " --------------   -----------        ---------------   --------------   ---------------   ------------   -----------\n"
      << std::scientific << std::setprecision(4) << "  " << (gas.steps+1)*dt*gas.time
      << std::fixed << std::setprecision(5) << "  " << std::setw(15) << ta << "       " << std::setw(15) << pa << "     " << std::setw(10) << gc << "       " << std::setw(10) << z
      << std::scientific << std::setprecision(5) << "        " << std::setw(10) << volume*gas.volume << "         " << particleCount << "\n";
    averages=avg.str();
    std::ostringstream log; log << transcript << "\n  AVERAGE TEMPERATURE (K):                 " << std::fixed << std::setprecision(5) << ta
      << "\n  AVERAGE PRESSURE  (Pa):                  " << pa << "\n  PV/nT (J * mol^-1 K^-1):                 " << gc
      << "\n  PERCENT ERROR of pV/nT AND GAS CONSTANT: " << 100*std::fabs(gc-8.3144598)/8.3144598
      << "\n  THE COMPRESSIBILITY (unitless):          " << z << "\n  TOTAL VOLUME (m^3):                      " << std::scientific << volume*gas.volume
      << "\n  NUMBER OF PARTICLES (unitless):          " << particleCount << "\n";
    transcript=log.str(); complete=true;
  }
};
Simulation* current = nullptr;
}

extern "C" {
int md_initialize(const char* title, const char* gas, double temperatureKelvin, double density, uint32_t seed) {
  delete current; current = new Simulation(); current->title=title ? title : "calculation";
  if (temperatureKelvin < 0 || density <= 0) return 1;
  current->gas = gasFor(gas ? gas : "Ar", current->gasName); current->temperatureInitial=temperatureKelvin/current->gas.temperature;
  current->volume=particleCount/(density*NA)/current->gas.volume;
  if (current->volume < particleCount) return 2;
  current->box=std::pow(current->volume,1.0/3.0); current->dt=(current->gasName=="He" ? .2e-14 : .5e-14)/current->gas.time;
  current->rng=seed ? seed : 1; current->frames.reserve(static_cast<size_t>(current->gas.steps+1)*particleCount*3);
  current->transcript="\n                     YOU ARE SIMULATING "+current->gasName+" GAS! \n";
  current->output="  time (s)              T(t) (K)              P(t) (Pa)           Kinetic En. (n.u.)     Potential En. (n.u.) Total En. (n.u.)\n";
  current->initializePositions(); current->accelerations(); current->initialized=true; return 0;
}
int md_step(int count) {
  if (!current || !current->initialized || current->complete || current->cancelled) return 0;
  for (int n=0;n<count && current->step<=current->gas.steps;++n,++current->step) {
    const double press=current->verlet()*current->gas.pressure, temp=current->meanSquaredVelocity()/3.0*current->gas.temperature;
    const double ke=current->kinetic(), pe=current->potential(); current->pAverage+=press; current->tAverage+=temp;
    std::ostringstream row; row << "  " << std::scientific << std::setprecision(4) << std::setw(8) << current->step*current->dt*current->gas.time
      << std::fixed << std::setprecision(8) << "  " << std::setw(20) << temp << "  " << std::setw(20) << press << " " << std::setw(20) << ke << "  " << std::setw(20) << pe << "  " << std::setw(20) << ke+pe << " \n";
    current->output += row.str(); current->capture();
  }
  if (current->step>current->gas.steps) { current->transcript += "\n"; current->finish(); } return 1;
}
int md_is_finished() { return current && current->complete; }
int md_is_cancelled() { return current && current->cancelled; }
void md_cancel() { if(current) current->cancelled=true; }
int md_frame_count() { return current ? static_cast<int>(current->frames.size()/(particleCount*3)) : 0; }
float* md_frame_ptr() { return current && !current->frames.empty() ? current->frames.data() : nullptr; }
double md_box_length() { return current ? current->box : 0; }
double md_progress() { return current ? static_cast<double>(current->step)/(current->gas.steps+1) : 0; }
double md_total_time_seconds() { return current ? (current->gas.steps+1)*current->dt*current->gas.time : 0; }
double md_average_temperature() { return current ? current->tAverage/current->gas.steps : 0; }
double md_average_pressure() { return current ? current->pAverage/current->gas.steps : 0; }
double md_pv_over_nt() {
  if (!current) return 0;
  const double ta = current->tAverage/current->gas.steps, pa = current->pAverage/current->gas.steps;
  return NA*pa*(current->volume*current->gas.volume)/(particleCount*ta);
}
double md_percent_error() { return 100*std::fabs(md_pv_over_nt()-8.3144598)/8.3144598; }
double md_compressibility_factor() {
  if (!current) return 0;
  const double ta = current->tAverage/current->gas.steps, pa = current->pAverage/current->gas.steps;
  return pa*(current->volume*current->gas.volume)/(particleCount*kBSI*ta);
}
double md_volume_cubic_meters() { return current ? current->volume*current->gas.volume : 0; }
int md_particle_count() { return particleCount; }
const char* md_output_ptr() { return current ? current->output.c_str() : ""; }
const char* md_average_ptr() { return current ? current->averages.c_str() : ""; }
const char* md_console_ptr() { return current ? current->transcript.c_str() : ""; }
void md_free() { delete current; current=nullptr; }
}
