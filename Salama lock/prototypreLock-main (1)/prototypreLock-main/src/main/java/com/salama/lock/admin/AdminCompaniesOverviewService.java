package com.salama.lock.admin;

import com.salama.lock.domain.entity.Company;
import com.salama.lock.domain.entity.Device;
import com.salama.lock.domain.enums.DeviceStatus;
import com.salama.lock.domain.repository.CompanyRepository;
import com.salama.lock.domain.repository.DeviceRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AdminCompaniesOverviewService {

    private final CompanyRepository companyRepository;
    private final DeviceRepository deviceRepository;

    @Transactional(readOnly = true)
    public Map<String, Object> overview() {
        List<Company> companies = companyRepository.findAll(Sort.by(Sort.Direction.ASC, "name"));
        List<Device> devices = deviceRepository.findAll(Sort.by(Sort.Direction.DESC, "updatedAt"));

        Map<String, List<Device>> byCompany = devices.stream()
                .collect(Collectors.groupingBy(d -> d.getCompany().getId().toString()));

        long locked = devices.stream().filter(d -> d.getStatus() == DeviceStatus.LOCKED).count();
        long unlocked = devices.stream()
                .filter(d -> d.getStatus() == DeviceStatus.UNLOCKED
                        || d.getStatus() == DeviceStatus.REGISTERED
                        || d.getStatus() == DeviceStatus.ACTIVE)
                .count();
        long deactivated = devices.stream()
                .filter(d -> d.getStatus() == DeviceStatus.DEACTIVATED || d.getStatus() == DeviceStatus.RETIRED)
                .count();

        List<Map<String, Object>> companyRows = new ArrayList<>();
        for (Company c : companies) {
            List<Device> companyDevices = byCompany.getOrDefault(c.getId().toString(), List.of());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", c.getId());
            row.put("name", c.getName());
            row.put("code", c.getCode());
            row.put("status", c.getStatus());
            row.put("contact_email", c.getContactEmail());
            row.put("created_at", c.getCreatedAt());
            row.put("device_count", companyDevices.size());
            row.put(
                    "locked_count",
                    companyDevices.stream().filter(d -> d.getStatus() == DeviceStatus.LOCKED).count());
            row.put(
                    "unlocked_count",
                    companyDevices.stream()
                            .filter(d -> d.getStatus() == DeviceStatus.UNLOCKED
                                    || d.getStatus() == DeviceStatus.REGISTERED
                                    || d.getStatus() == DeviceStatus.ACTIVE)
                            .count());
            row.put("devices", companyDevices.stream().map(this::deviceRow).toList());
            companyRows.add(row);
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("companies", companies.size());
        summary.put("devices", devices.size());
        summary.put("locked", locked);
        summary.put("unlocked_or_registered", unlocked);
        summary.put("deactivated", deactivated);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", summary);
        result.put("companies", companyRows);
        return result;
    }

    private Map<String, Object> deviceRow(Device d) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", d.getId());
        row.put("imei", d.getImei());
        row.put("lock_id", d.getLockId());
        row.put("device_type", d.getDeviceType());
        row.put("status", d.getStatus());
        row.put("manufacturer", d.getManufacturer());
        row.put("model", d.getModel());
        row.put("serial_number", d.getSerialNumber());
        row.put("registered_at", d.getRegisteredAt());
        row.put("updated_at", d.getUpdatedAt());
        row.put("deactivated_at", d.getDeactivatedAt());
        return row;
    }
}
