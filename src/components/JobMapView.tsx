import { useState, useMemo, useEffect, useRef } from 'react';
import { TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { SafeMapContainer as MapContainer } from '@/components/leaflet/SafeMapContainer';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Job, ALLSAINTS_TEAMS, FAN_TEAMS } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Users, Navigation, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// Fix leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface GeocodedJob extends Job {
  lat?: number;
  lng?: number;
  geocodeError?: boolean;
}

interface JobGroup {
  id: string;
  name: string;
  jobs: GeocodedJob[];
  centerLat?: number;
  centerLng?: number;
}

type GroupByType = 'postcode' | 'proximity' | 'status' | 'team';

interface JobMapViewProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  isFanCategory?: boolean;
}

// Create custom colored markers
const createColoredIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

// Component to fit map bounds
const FitBounds = ({ jobs }: { jobs: GeocodedJob[] }) => {
  const map = useMap();
  
  useEffect(() => {
    const validJobs = jobs.filter(j => j.lat && j.lng);
    if (validJobs.length > 0) {
      const bounds = L.latLngBounds(validJobs.map(j => [j.lat!, j.lng!]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [jobs, map]);
  
  return null;
};

// Extract UK postcode prefix from address
const extractPostcodePrefix = (address: string): string => {
  const postcodeMatch = address.match(/([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}/i);
  if (postcodeMatch) {
    return postcodeMatch[1].toUpperCase();
  }
  // Try just the outward code
  const outwardMatch = address.match(/([A-Z]{1,2}\d{1,2}[A-Z]?)/i);
  return outwardMatch ? outwardMatch[1].toUpperCase() : 'Unknown';
};

// Calculate distance between two coordinates in miles
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export const JobMapView = ({ jobs, onJobClick, isFanCategory = false }: JobMapViewProps) => {
  const [groupBy, setGroupBy] = useState<GroupByType>('postcode');
  const [proximityMiles, setProximityMiles] = useState(2);
  const [geocodedJobs, setGeocodedJobs] = useState<GeocodedJob[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ current: 0, total: 0 });
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [hoveredJob, setHoveredJob] = useState<string | null>(null);
  
  // Track which job IDs we've already geocoded to avoid re-fetching
  const geocodedJobIdsRef = useRef<Set<string>>(new Set());

  const teams = isFanCategory ? FAN_TEAMS : ALLSAINTS_TEAMS;

  // Geocode addresses using backend with caching
  useEffect(() => {
    const geocodeJobs = async () => {
      const uncompletedJobs = jobs.filter(j => !j.isCompleted);
      
      // Check which jobs are already geocoded
      const newJobs = uncompletedJobs.filter(j => !geocodedJobIdsRef.current.has(j.id));
      
      // If no new jobs to geocode, just update with existing data
      if (newJobs.length === 0 && geocodedJobs.length > 0) {
        // Filter out any completed jobs from current geocoded list
        setGeocodedJobs(prev => prev.filter(gj => uncompletedJobs.some(j => j.id === gj.id)));
        return;
      }
      
      setIsGeocoding(true);
      
      // Get addresses for new jobs only
      const addressesToGeocode = newJobs
        .filter(j => j.address)
        .map(j => j.address!);
      
      setGeocodeProgress({ current: 0, total: addressesToGeocode.length });
      
      try {
        let geocodeResults: Record<string, { lat: number | null; lng: number | null; geocode_error: boolean }> = {};
        
        if (addressesToGeocode.length > 0) {
          // Call backend geocoding function with all addresses
          const { data, error } = await supabase.functions.invoke('geocode-addresses', {
            body: { addresses: addressesToGeocode }
          });
          
          if (error) {
            console.error('Geocoding error:', error);
          } else if (data?.results) {
            geocodeResults = data.results;
          }
        }
        
        // Merge results with jobs
        const newGeocodedJobs: GeocodedJob[] = newJobs.map(job => {
          if (!job.address) {
            return { ...job, geocodeError: true };
          }
          
          const result = geocodeResults[job.address];
          if (result) {
            geocodedJobIdsRef.current.add(job.id);
            return {
              ...job,
              lat: result.lat ?? undefined,
              lng: result.lng ?? undefined,
              geocodeError: result.geocode_error,
            };
          }
          
          return { ...job, geocodeError: true };
        });
        
        // Combine with existing geocoded jobs (preserving previous results)
        setGeocodedJobs(prev => {
          const existingMap = new Map(prev.map(j => [j.id, j]));
          newGeocodedJobs.forEach(j => existingMap.set(j.id, j));
          // Only include jobs that are still in the uncompleted list
          return Array.from(existingMap.values())
            .filter(gj => uncompletedJobs.some(j => j.id === gj.id));
        });
        
        setGeocodeProgress({ current: addressesToGeocode.length, total: addressesToGeocode.length });
      } catch (error) {
        console.error('Geocoding failed:', error);
      }
      
      setIsGeocoding(false);
    };

    if (jobs.length > 0) {
      geocodeJobs();
    } else {
      setGeocodedJobs([]);
    }
  }, [jobs]);

  // Group jobs based on selected method
  const groups = useMemo(() => {
    const validJobs = geocodedJobs.filter(j => j.lat && j.lng);
    
    if (groupBy === 'postcode') {
      const postcodeGroups: Record<string, GeocodedJob[]> = {};
      geocodedJobs.forEach(job => {
        const prefix = extractPostcodePrefix(job.address || '');
        if (!postcodeGroups[prefix]) postcodeGroups[prefix] = [];
        postcodeGroups[prefix].push(job);
      });
      
      return Object.entries(postcodeGroups).map(([prefix, jobs]) => {
        const validJobsInGroup = jobs.filter(j => j.lat && j.lng);
        return {
          id: prefix,
          name: prefix === 'Unknown' ? 'No Postcode' : `${prefix} Area`,
          jobs,
          centerLat: validJobsInGroup.length > 0 
            ? validJobsInGroup.reduce((sum, j) => sum + j.lat!, 0) / validJobsInGroup.length 
            : undefined,
          centerLng: validJobsInGroup.length > 0 
            ? validJobsInGroup.reduce((sum, j) => sum + j.lng!, 0) / validJobsInGroup.length 
            : undefined,
        };
      }).sort((a, b) => b.jobs.length - a.jobs.length);
    }
    
    if (groupBy === 'proximity') {
      // Cluster jobs within proximity miles of each other
      const clusters: GeocodedJob[][] = [];
      const assigned = new Set<string>();
      
      validJobs.forEach(job => {
        if (assigned.has(job.id)) return;
        
        const cluster = [job];
        assigned.add(job.id);
        
        validJobs.forEach(otherJob => {
          if (assigned.has(otherJob.id)) return;
          
          const distance = calculateDistance(
            job.lat!, job.lng!, 
            otherJob.lat!, otherJob.lng!
          );
          
          if (distance <= proximityMiles) {
            cluster.push(otherJob);
            assigned.add(otherJob.id);
          }
        });
        
        clusters.push(cluster);
      });
      
      // Add jobs without coordinates
      const unlocatedJobs = geocodedJobs.filter(j => !j.lat || !j.lng);
      if (unlocatedJobs.length > 0) {
        clusters.push(unlocatedJobs);
      }
      
      return clusters.map((jobs, i) => {
        const validJobsInCluster = jobs.filter(j => j.lat && j.lng);
        return {
          id: `cluster-${i}`,
          name: validJobsInCluster.length > 0 
            ? `Cluster (${jobs.length} jobs)` 
            : 'Unlocated Jobs',
          jobs,
          centerLat: validJobsInCluster.length > 0 
            ? validJobsInCluster.reduce((sum, j) => sum + j.lat!, 0) / validJobsInCluster.length 
            : undefined,
          centerLng: validJobsInCluster.length > 0 
            ? validJobsInCluster.reduce((sum, j) => sum + j.lng!, 0) / validJobsInCluster.length 
            : undefined,
        };
      }).sort((a, b) => b.jobs.length - a.jobs.length);
    }
    
    if (groupBy === 'status') {
      const statusGroups: Record<string, GeocodedJob[]> = {};
      geocodedJobs.forEach(job => {
        const status = job.status || 'pending';
        if (!statusGroups[status]) statusGroups[status] = [];
        statusGroups[status].push(job);
      });
      
      return Object.entries(statusGroups).map(([status, jobs]) => {
        const validJobsInGroup = jobs.filter(j => j.lat && j.lng);
        return {
          id: status,
          name: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          jobs,
          centerLat: validJobsInGroup.length > 0 
            ? validJobsInGroup.reduce((sum, j) => sum + j.lat!, 0) / validJobsInGroup.length 
            : undefined,
          centerLng: validJobsInGroup.length > 0 
            ? validJobsInGroup.reduce((sum, j) => sum + j.lng!, 0) / validJobsInGroup.length 
            : undefined,
        };
      });
    }
    
    if (groupBy === 'team') {
      const teamGroups: Record<string, GeocodedJob[]> = { 'Unassigned': [] };
      geocodedJobs.forEach(job => {
        const team = job.team || 'Unassigned';
        if (!teamGroups[team]) teamGroups[team] = [];
        teamGroups[team].push(job);
      });
      
      return Object.entries(teamGroups)
        .filter(([_, jobs]) => jobs.length > 0)
        .map(([team, jobs]) => {
          const validJobsInGroup = jobs.filter(j => j.lat && j.lng);
          const teamData = teams.find(t => t.name === team);
          return {
            id: team,
            name: team,
            jobs,
            color: teamData?.color,
            centerLat: validJobsInGroup.length > 0 
              ? validJobsInGroup.reduce((sum, j) => sum + j.lat!, 0) / validJobsInGroup.length 
              : undefined,
            centerLng: validJobsInGroup.length > 0 
              ? validJobsInGroup.reduce((sum, j) => sum + j.lng!, 0) / validJobsInGroup.length 
              : undefined,
          };
        });
    }
    
    return [];
  }, [geocodedJobs, groupBy, proximityMiles, teams]);

  // Get color for a job marker
  const getJobColor = (job: GeocodedJob): string => {
    if (groupBy === 'team') {
      const teamData = teams.find(t => t.name === job.team);
      return teamData?.color || '#6B7280';
    }
    if (groupBy === 'status') {
      const statusColors: Record<string, string> = {
        pending: '#6B7280',
        started: '#3B82F6',
        complete: '#10B981',
        pause: '#F59E0B',
        no_show: '#EF4444',
        no_answer: '#F97316',
        voice_message: '#8B5CF6',
        call_back: '#06B6D4',
        left_property: '#84CC16',
        return_nph: '#EC4899',
      };
      return statusColors[job.status || 'pending'] || '#6B7280';
    }
    return '#3B82F6';
  };

  const visibleJobs = selectedGroup 
    ? groups.find(g => g.id === selectedGroup)?.jobs || []
    : geocodedJobs;

  const geocodedCount = geocodedJobs.filter(j => j.lat && j.lng).length;
  const errorCount = geocodedJobs.filter(j => j.geocodeError).length;

  return (
    <div className="flex h-full gap-4">
      {/* Side Panel */}
      <Card className="w-80 flex-shrink-0 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Geo Grouping
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Grouping Options */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Group By</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postcode">Postcode Area</SelectItem>
                  <SelectItem value="proximity">Proximity (Miles)</SelectItem>
                  <SelectItem value="status">Job Status</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {groupBy === 'proximity' && (
              <div>
                <Label className="text-xs">Distance (miles)</Label>
                <Input
                  type="number"
                  min={0.5}
                  max={50}
                  step={0.5}
                  value={proximityMiles}
                  onChange={(e) => setProximityMiles(Number(e.target.value))}
                  className="h-8 text-xs"
                />
              </div>
            )}
          </div>

          {/* Geocoding Progress */}
          {isGeocoding && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Geocoding {geocodeProgress.current}/{geocodeProgress.total}...
            </div>
          )}

          {!isGeocoding && geocodedJobs.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {geocodedCount} jobs mapped
              {errorCount > 0 && (
                <span className="text-amber-500"> • {errorCount} failed</span>
              )}
            </div>
          )}

          {/* Groups List */}
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              <Button
                variant={selectedGroup === null ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start h-8 text-xs"
                onClick={() => setSelectedGroup(null)}
              >
                <Users className="w-3 h-3 mr-2" />
                All Jobs ({geocodedJobs.length})
              </Button>
              
              {groups.map(group => (
                <Button
                  key={group.id}
                  variant={selectedGroup === group.id ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-between h-8 text-xs"
                  onClick={() => setSelectedGroup(group.id)}
                >
                  <span className="flex items-center gap-2 truncate">
                    {groupBy === 'team' && (
                      <span 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: (group as any).color || '#6B7280' }}
                      />
                    )}
                    {group.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-4">
                    {group.jobs.length}
                  </Badge>
                </Button>
              ))}
            </div>
          </ScrollArea>

          {/* Selected Group Jobs */}
          {selectedGroup && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium mb-2">Jobs in Group</p>
              <ScrollArea className="h-32">
                <div className="space-y-1">
                  {groups.find(g => g.id === selectedGroup)?.jobs.map(job => (
                    <button
                      key={job.id}
                      className={cn(
                        "w-full text-left px-2 py-1 rounded text-xs hover:bg-muted transition-colors",
                        hoveredJob === job.id && "bg-muted"
                      )}
                      onClick={() => onJobClick(job)}
                      onMouseEnter={() => setHoveredJob(job.id)}
                      onMouseLeave={() => setHoveredJob(null)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate">{job.jobNumber}</span>
                        {job.geocodeError && (
                          <AlertCircle className="w-3 h-3 text-amber-500" />
                        )}
                      </div>
                      <p className="text-muted-foreground truncate">{job.address}</p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Map */}
      <div className="flex-1 rounded-lg overflow-hidden border">
        {isGeocoding && geocodedJobs.length === 0 ? (
          <div className="h-full flex items-center justify-center bg-muted/30">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">
                Geocoding addresses... ({geocodeProgress.current}/{geocodeProgress.total})
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This may take a moment
              </p>
            </div>
          </div>
        ) : (
          <MapContainer
            center={[51.5074, -0.1278]} // London default
            zoom={10}
            className="h-full w-full"
            style={{ minHeight: '400px' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds jobs={visibleJobs.filter(j => j.lat && j.lng) as GeocodedJob[]} />
            
            {visibleJobs
              .filter(job => job.lat && job.lng)
              .map(job => (
                <Marker
                  key={job.id}
                  position={[job.lat!, job.lng!]}
                  icon={createColoredIcon(getJobColor(job))}
                  eventHandlers={{
                    click: () => onJobClick(job),
                    mouseover: () => setHoveredJob(job.id),
                    mouseout: () => setHoveredJob(null),
                  }}
                >
                  <Popup>
                    <div className="text-sm min-w-48">
                      <p className="font-semibold">{job.jobNumber}</p>
                      <p className="text-muted-foreground">{job.name}</p>
                      <p className="text-xs mt-1">{job.address}</p>
                      {job.team && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {job.team}
                        </Badge>
                      )}
                      <Button 
                        size="sm" 
                        className="w-full mt-2 h-7 text-xs"
                        onClick={() => onJobClick(job)}
                      >
                        View Details <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
};
